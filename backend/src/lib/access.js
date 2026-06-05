const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Error with an HTTP status the global error handler understands.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Membership row for (tripId, userId), or null.
function getMembership(tripId, userId) {
  if (!tripId || !userId) return Promise.resolve(null);
  return prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
}

// Throws 404 when the user has no access (404 rather than 403 so we don't
// reveal that a trip exists). Pass requireOwner to demand the OWNER role.
async function assertTripAccess(tripId, userId, { requireOwner = false } = {}) {
  const membership = await getMembership(tripId, userId);
  if (!membership) throw new HttpError(404, 'Trip not found');
  if (requireOwner && membership.role !== 'OWNER') {
    throw new HttpError(403, 'Only the trip owner can do that');
  }
  return membership;
}

// Resolve the owning tripId for a nested resource (null if it doesn't exist).
async function tripIdForDay(dayId) {
  if (!dayId) return null;
  const day = await prisma.day.findUnique({ where: { id: dayId }, select: { tripId: true } });
  return day?.tripId ?? null;
}

async function tripIdForSlot(slotId) {
  if (!slotId) return null;
  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    select: { day: { select: { tripId: true } } },
  });
  return slot?.day?.tripId ?? null;
}

async function tripIdForIdea(ideaId) {
  if (!ideaId) return null;
  const idea = await prisma.idea.findUnique({ where: { id: ideaId }, select: { tripId: true } });
  return idea?.tripId ?? null;
}

module.exports = {
  HttpError,
  prisma,
  getMembership,
  assertTripAccess,
  tripIdForDay,
  tripIdForSlot,
  tripIdForIdea,
};
