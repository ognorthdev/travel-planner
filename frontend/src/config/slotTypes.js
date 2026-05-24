import { Hotel, Coffee, Utensils, Moon, Sun } from 'lucide-react';

const SLOT_CONFIG = {
  HOTEL: {
    label: 'Hotel',
    icon: Hotel,
    color: 'text-purple-400',
    bg: 'bg-purple-900/30',
    border: 'border-purple-700/50',
    dot: 'bg-purple-400',
    addLabel: 'Add Hotel',
    previewField: 'hotelName'
  },
  BREAKFAST: {
    label: 'Breakfast',
    icon: Coffee,
    color: 'text-amber-400',
    bg: 'bg-amber-900/30',
    border: 'border-amber-700/50',
    dot: 'bg-amber-400',
    addLabel: 'Add Breakfast',
    previewField: 'restaurantName'
  },
  LUNCH: {
    label: 'Lunch',
    icon: Utensils,
    color: 'text-green-400',
    bg: 'bg-green-900/30',
    border: 'border-green-700/50',
    dot: 'bg-green-400',
    addLabel: 'Add Lunch',
    previewField: 'restaurantName'
  },
  DINNER: {
    label: 'Dinner',
    icon: Moon,
    color: 'text-indigo-400',
    bg: 'bg-indigo-900/30',
    border: 'border-indigo-700/50',
    dot: 'bg-indigo-400',
    addLabel: 'Add Dinner',
    previewField: 'restaurantName'
  },
  ACTIVITY: {
    label: 'Activity',
    icon: Sun,
    color: 'text-teal-400',
    bg: 'bg-teal-900/30',
    border: 'border-teal-700/50',
    dot: 'bg-teal-400',
    addLabel: 'Add Activity',
    previewField: 'activityName'
  }
};

export default SLOT_CONFIG;
