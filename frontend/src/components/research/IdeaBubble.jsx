import React from 'react';
import SlotCard from '../SlotCard.jsx';

export default function IdeaBubble({ idea, onDelete, onClickIdea, isDragging }) {
  const parsedData = typeof idea.data === 'string' ? JSON.parse(idea.data || '{}') : (idea.data || {});
  const storedPhotos = parsedData.enrichment?.photos || parsedData.photos || [];

  const slotLike = {
    type: idea.type,
    data: {
      ...parsedData,
      enrichment: { name: idea.name, photos: storedPhotos },
      description: idea.description,
    },
  };

  const handleDragStart = (e) => {
    const payload = {
      source: 'research',
      type: idea.type,
      name: idea.name,
      description: idea.description,
      data: typeof idea.data === 'string' ? idea.data : JSON.stringify(idea.data || {}),
      ideaId: idea.id,
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  return (
    <SlotCard
      slot={slotLike}
      compact
      isDragging={isDragging}
      onClick={() => onClickIdea?.(idea)}
      onDragStart={handleDragStart}
      onDelete={onDelete ? () => onDelete(idea) : undefined}
    />
  );
}
