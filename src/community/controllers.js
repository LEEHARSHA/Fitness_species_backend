import { ObjectId } from 'mongodb';
import {
  adminReviewSchema,
  createEventSchema,
  eventStatuses,
  organizerApplicationSchema,
  organizerStatuses,
  organizerProfileSchema,
  publicEventQuerySchema,
  registrationQuerySchema,
  updateEventSchema,
} from './validation.js';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function invalid(res, result) {
  res.status(400).json({
    success: false,
    message: result.error.issues[0]?.message || 'Request validation failed.',
    issues: result.error.issues.map(({ path, message }) => ({ path, message })),
  });
}

function validObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value) && ObjectId.isValid(value);
}

function displayName(organizer) {
  return organizer.organizationName || organizer.contactName || 'Fitness Species organizer';
}

function organizerResponse(organizer, includePrivate = false) {
  if (!organizer) return null;
  const response = {
    id: organizer._id?.toString(),
    type: organizer.type,
    organizationName: organizer.organizationName || '',
    organizationType: organizer.organizationType || '',
    contactName: organizer.contactName || '',
    phone: organizer.phone || '',
    address: organizer.address || '',
    city: organizer.city || '',
    website: organizer.website || '',
    description: organizer.description || '',
    experience: organizer.experience || '',
    publicProfile: organizer.publicProfile || '',
    status: organizer.status,
    reviewNote: organizer.reviewNote || null,
    submittedAt: organizer.submittedAt || organizer.createdAt,
    updatedAt: organizer.updatedAt,
    approvedAt: organizer.approvedAt || null,
  };
  if (includePrivate) {
    response.firebaseUid = organizer.firebaseUid;
    response.email = organizer.email || '';
  }
  return response;
}

function eventResponse(event, organizer, { publicView = false } = {}) {
  if (!event) return null;
  const response = {
    id: event._id.toString(),
    title: event.title,
    description: event.description,
    category: event.category,
    coverImageUrl: event.coverImageUrl,
    startAt: event.startAt,
    endAt: event.endAt,
    timeZone: event.timeZone,
    venueType: event.venueType,
    venueName: event.venueName || '',
    address: event.address || '',
    city: event.city || '',
    postalCode: event.postalCode || '',
    latitude: event.location?.coordinates?.[1] ?? null,
    longitude: event.location?.coordinates?.[0] ?? null,
    registrationDeadline: event.registrationDeadline || null,
    capacity: event.capacity ?? null,
    registrationCount: event.registrationCount || 0,
    eligibility: event.eligibility || '',
    instructions: event.instructions || '',
    pricingType: event.pricingType,
    amount: event.pricingType === 'paid' ? event.amount : null,
    currency: event.currency || 'INR',
    externalRegistrationUrl: event.externalRegistrationUrl || '',
    status: event.status,
    reviewNote: event.reviewNote || null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    publishedAt: event.publishedAt || null,
    organizer: organizer ? {
      name: displayName(organizer),
      type: organizer.type,
      verified: organizer.status === 'approved',
      website: organizer.website || '',
      publicProfile: organizer.publicProfile || '',
    } : null,
  };
  if (!publicView) response.organizerUid = event.organizerUid;
  return response;
}

function makeEventDocument(input, uid, now) {
  return {
    organizerUid: uid,
    organizerType: input.organizerType,
    title: input.title,
    description: input.description,
    category: input.category,
    coverImageUrl: input.coverImageUrl,
    startAt: new Date(input.startAt),
    endAt: new Date(input.endAt),
    timeZone: input.timeZone,
    venueType: input.venueType,
    venueName: input.venueName || '',
    address: input.address || '',
    city: input.city || '',
    postalCode: input.postalCode || '',
    ...(input.latitude !== undefined ? {
      location: { type: 'Point', coordinates: [input.longitude, input.latitude] },
    } : {}),
    ...(input.registrationDeadline ? { registrationDeadline: new Date(input.registrationDeadline) } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    eligibility: input.eligibility || '',
    instructions: input.instructions || '',
    pricingType: input.pricingType,
    ...(input.pricingType === 'paid' ? { amount: input.amount } : {}),
    currency: input.currency.toUpperCase(),
    externalRegistrationUrl: input.externalRegistrationUrl || '',
    registrationCount: 0,
    status: 'draft',
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  };
}

function eventQueryFilter(query) {
  const filter = {
    status: 'approved',
    startAt: { $gte: query.startDate ? new Date(query.startDate) : new Date() },
  };
  if (query.category) filter.category = query.category;
  if (query.organizerType) filter.organizerType = query.organizerType;
  if (query.pricingType) filter.pricingType = query.pricingType;
  if (query.city) filter.city = new RegExp(query.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (query.postalCode) filter.postalCode = query.postalCode;
  if (query.endDate) filter.startAt.$lte = new Date(query.endDate);
  if (query.search) {
    const expression = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: expression }, { description: expression }, { city: expression }];
  }
  if (query.latitude !== undefined) {
    filter.location = query.sortBy === 'distance'
      ? {
        $near: {
          $geometry: { type: 'Point', coordinates: [query.longitude, query.latitude] },
          $maxDistance: query.radiusKm * 1000,
        },
      }
      : {
        $geoWithin: {
          $centerSphere: [[query.longitude, query.latitude], query.radiusKm / 6378.1],
        },
      };
  }
  return filter;
}

export function createCommunityControllers({ getDb }) {
  const applyAsOrganizer = asyncRoute(async (req, res) => {
    const result = organizerApplicationSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);
    const db = getDb();
    const collection = db.collection('communityOrganizers');
    const existing = await collection.findOne({ firebaseUid: req.user.uid });
    if (existing?.status === 'approved' || existing?.status === 'pending') {
      res.status(409).json({
        success: false,
        message: existing.status === 'approved'
          ? 'This account is already an approved organizer.'
          : 'An organizer application is already under review.',
      });
      return;
    }
    const now = new Date();
    const document = {
      ...result.data,
      firebaseUid: req.user.uid,
      email: req.user.email || '',
      status: 'pending',
      reviewNote: null,
      submittedAt: now,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
      approvedAt: null,
    };
    const organizer = await collection.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      {
        $set: document,
      },
      { upsert: true, returnDocument: 'after' },
    );
    res.status(existing ? 200 : 201).json({
      success: true,
      organizer: organizerResponse(organizer),
    });
  });

  const getMyOrganizer = asyncRoute(async (req, res) => {
    const organizer = await getDb().collection('communityOrganizers')
      .findOne({ firebaseUid: req.user.uid });
    if (!organizer) {
      res.status(404).json({
        success: false,
        code: 'ORGANIZER_APPLICATION_REQUIRED',
        message: 'Submit an organizer application to continue.',
      });
      return;
    }
    res.json({ success: true, organizer: organizerResponse(organizer) });
  });

  const getOrganizerSummary = asyncRoute(async (req, res) => {
    const db = getDb();
    const owner = { organizerUid: req.user.uid };
    const events = await db.collection('communityEvents').find(owner).toArray();
    const now = new Date();
    res.json({
      success: true,
      summary: {
        totalEvents: events.length,
        upcomingEvents: events.filter((event) => event.status === 'approved' && event.startAt > now).length,
        registrations: events.reduce((total, event) => total + (event.registrationCount || 0), 0),
        completedEvents: events.filter((event) => event.status === 'completed').length,
        pendingReviewEvents: events.filter((event) => event.status === 'pending_review').length,
      },
    });
  });

  const updateMyOrganizer = asyncRoute(async (req, res) => {
    const result = organizerProfileSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);
    const collection = getDb().collection('communityOrganizers');
    const organizer = await collection.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      { $set: { ...result.data, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!organizer) {
      res.status(404).json({ success: false, message: 'Organizer application not found.' });
      return;
    }
    res.json({ success: true, organizer: organizerResponse(organizer) });
  });

  const createEvent = asyncRoute(async (req, res) => {
    const organizer = await getDb().collection('communityOrganizers')
      .findOne({ firebaseUid: req.user.uid });
    if (organizer?.status !== 'approved') {
      res.status(403).json({
        success: false,
        message: 'Only approved organizers can create event drafts.',
      });
      return;
    }
    const result = createEventSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);
    const now = new Date();
    const collection = getDb().collection('communityEvents');
    const inserted = await collection.insertOne(makeEventDocument({
      ...result.data,
      organizerType: organizer.type,
    }, req.user.uid, now));
    const event = await collection.findOne({ _id: inserted.insertedId });
    res.status(201).json({ success: true, event: eventResponse(event, organizer) });
  });

  const listMyEvents = asyncRoute(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !['draft', ...eventStatuses].includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid event status.' });
      return;
    }
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ success: false, message: 'Invalid pagination values.' });
      return;
    }
    const filter = { organizerUid: req.user.uid, ...(status ? { status } : {}) };
    const collection = getDb().collection('communityEvents');
    const [events, total] = await Promise.all([
      collection.find(filter).sort({ startAt: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);
    const organizer = await getDb().collection('communityOrganizers')
      .findOne({ firebaseUid: req.user.uid });
    res.json({
      success: true,
      count: events.length,
      total,
      page,
      limit,
      events: events.map((event) => eventResponse(event, organizer)),
    });
  });

  const getMyEvent = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const db = getDb();
    const event = await db.collection('communityEvents').findOne({
      _id: new ObjectId(req.params.eventId),
      organizerUid: req.user.uid,
    });
    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found.' });
      return;
    }
    const organizer = await db.collection('communityOrganizers')
      .findOne({ firebaseUid: req.user.uid });
    res.json({ success: true, event: eventResponse(event, organizer) });
  });

  const updateMyEvent = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const result = updateEventSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);
    const db = getDb();
    const events = db.collection('communityEvents');
    const filter = { _id: new ObjectId(req.params.eventId), organizerUid: req.user.uid };
    const current = await events.findOne(filter);
    if (!current) {
      res.status(404).json({ success: false, message: 'Event not found.' });
      return;
    }
    if (!['draft', 'rejected', 'changes_requested', 'approved'].includes(current.status)) {
      res.status(409).json({ success: false, message: 'This event cannot be edited in its current status.' });
      return;
    }
    const merged = { ...current, ...result.data };
    if (result.data.pricingType === 'free') delete merged.amount;
    const checked = createEventSchema.safeParse({
      title: merged.title,
      description: merged.description,
      category: merged.category,
      coverImageUrl: merged.coverImageUrl,
      startAt: new Date(merged.startAt).toISOString(),
      endAt: new Date(merged.endAt).toISOString(),
      timeZone: merged.timeZone,
      venueType: merged.venueType,
      venueName: merged.venueName,
      address: merged.address,
      city: merged.city,
      postalCode: merged.postalCode,
      registrationDeadline: merged.registrationDeadline
        ? new Date(merged.registrationDeadline).toISOString()
        : undefined,
      capacity: merged.capacity,
      eligibility: merged.eligibility,
      instructions: merged.instructions,
      pricingType: merged.pricingType,
      amount: merged.amount,
      currency: merged.currency,
      externalRegistrationUrl: merged.externalRegistrationUrl || undefined,
      latitude: result.data.latitude ?? current.location?.coordinates?.[1],
      longitude: result.data.longitude ?? current.location?.coordinates?.[0],
    });
    if (!checked.success) return invalid(res, checked);

    const update = { ...result.data };
    if (result.data.startAt) update.startAt = new Date(result.data.startAt);
    if (result.data.endAt) update.endAt = new Date(result.data.endAt);
    if (result.data.registrationDeadline) {
      update.registrationDeadline = new Date(result.data.registrationDeadline);
    }
    if (result.data.pricingType === 'free') delete update.amount;
    if (result.data.pricingType === 'paid' && result.data.amount === undefined) {
      update.amount = current.amount;
      if (update.amount === undefined) {
        res.status(400).json({ success: false, message: 'Paid events require a positive amount.' });
        return;
      }
    }
    if (result.data.latitude !== undefined && result.data.longitude !== undefined) {
      update.location = {
        type: 'Point',
        coordinates: [result.data.longitude, result.data.latitude],
      };
    } else {
      delete update.latitude;
      delete update.longitude;
    }
    if (current.status === 'approved') {
      update.status = 'pending_review';
      update.reviewNote = null;
      update.publishedAt = null;
    }
    update.updatedAt = new Date();
    const event = await events.findOneAndUpdate(
      filter,
      { $set: update },
      { returnDocument: 'after' },
    );
    const organizer = await db.collection('communityOrganizers')
      .findOne({ firebaseUid: req.user.uid });
    res.json({ success: true, event: eventResponse(event, organizer) });
  });

  const submitMyEvent = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const db = getDb();
    const organizer = await db.collection('communityOrganizers')
      .findOne({ firebaseUid: req.user.uid });
    if (organizer?.status !== 'approved') {
      res.status(403).json({ success: false, message: 'Only approved organizers can submit events.' });
      return;
    }
    const event = await db.collection('communityEvents').findOneAndUpdate(
      {
        _id: new ObjectId(req.params.eventId),
        organizerUid: req.user.uid,
        status: { $in: ['draft', 'rejected', 'changes_requested'] },
      },
      { $set: { status: 'pending_review', reviewNote: null, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!event) {
      res.status(409).json({
        success: false,
        message: 'Only your draft or rejected events can be submitted for review.',
      });
      return;
    }
    res.json({ success: true, event: eventResponse(event, organizer) });
  });

  const cancelMyEvent = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const db = getDb();
    const event = await db.collection('communityEvents').findOneAndUpdate(
      {
        _id: new ObjectId(req.params.eventId),
        organizerUid: req.user.uid,
        status: { $in: ['draft', 'pending_review', 'approved'] },
      },
      { $set: { status: 'cancelled', updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found or already closed.' });
      return;
    }
    const organizer = await db.collection('communityOrganizers')
      .findOne({ firebaseUid: req.user.uid });
    res.json({ success: true, event: eventResponse(event, organizer) });
  });

  const listEventRegistrations = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const pagination = registrationQuerySchema.safeParse(req.query);
    if (!pagination.success) return invalid(res, pagination);
    const db = getDb();
    const event = await db.collection('communityEvents').findOne({
      _id: new ObjectId(req.params.eventId),
      organizerUid: req.user.uid,
    });
    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found.' });
      return;
    }
    const filter = { eventId: event._id, status: 'registered' };
    const [registrations, total] = await Promise.all([
      db.collection('communityRegistrations').find(filter)
        .sort({ registeredAt: -1 })
        .skip((pagination.data.page - 1) * pagination.data.limit)
        .limit(pagination.data.limit)
        .toArray(),
      db.collection('communityRegistrations').countDocuments(filter),
    ]);
    res.json({
      success: true,
      count: registrations.length,
      total,
      page: pagination.data.page,
      limit: pagination.data.limit,
      registrations: registrations.map((registration) => ({
        id: registration._id.toString(),
        participantName: registration.participantName || 'Participant',
        status: registration.status,
        registeredAt: registration.registeredAt,
      })),
    });
  });

  const registerForEvent = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const db = getDb();
    const events = db.collection('communityEvents');
    const eventId = new ObjectId(req.params.eventId);
    const event = await events.findOne({ _id: eventId, status: 'approved' });
    if (!event) {
      res.status(404).json({ success: false, message: 'This event is not open for registration.' });
      return;
    }
    const now = new Date();
    if (
      event.startAt <= now
      || (event.registrationDeadline && event.registrationDeadline <= now)
    ) {
      res.status(409).json({ success: false, message: 'Registration for this event is closed.' });
      return;
    }
    const registrations = db.collection('communityRegistrations');
    const existing = await registrations.findOne({
      eventId,
      participantUid: req.user.uid,
    });
    if (existing?.status === 'registered') {
      res.status(409).json({ success: false, message: 'You are already registered for this event.' });
      return;
    }

    const capacityFilter = {
      _id: eventId,
      status: 'approved',
      startAt: { $gt: now },
      ...(event.registrationDeadline ? { registrationDeadline: { $gt: now } } : {}),
      ...(event.capacity !== undefined ? { registrationCount: { $lt: event.capacity } } : {}),
    };
    const reserved = await events.findOneAndUpdate(
      capacityFilter,
      { $inc: { registrationCount: 1 } },
      { returnDocument: 'after' },
    );
    if (!reserved) {
      res.status(409).json({ success: false, message: 'This event has reached capacity or is no longer open.' });
      return;
    }

    const registration = {
      eventId,
      participantUid: req.user.uid,
      participantName: req.user.name || 'Participant',
      status: 'registered',
      registeredAt: now,
      updatedAt: now,
    };
    try {
      if (existing) {
        const updated = await registrations.findOneAndUpdate(
          { _id: existing._id, status: 'cancelled' },
          { $set: registration },
          { returnDocument: 'after' },
        );
        if (!updated) throw new Error('REGISTRATION_ALREADY_ACTIVE');
      } else {
        await registrations.insertOne(registration);
      }
    } catch (error) {
      await events.updateOne({ _id: eventId }, { $inc: { registrationCount: -1 } });
      if (error?.code === 11000 || error?.message === 'REGISTRATION_ALREADY_ACTIVE') {
        res.status(409).json({ success: false, message: 'You are already registered for this event.' });
        return;
      }
      throw error;
    }
    res.status(existing ? 200 : 201).json({
      success: true,
      registration: {
        eventId: eventId.toString(),
        status: 'registered',
        registeredAt: now,
        paymentNote: event.pricingType === 'paid'
          ? 'This record does not confirm payment; use the organizer’s external payment instructions.'
          : null,
      },
    });
  });

  const cancelRegistration = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const db = getDb();
    const eventId = new ObjectId(req.params.eventId);
    const event = await db.collection('communityEvents').findOne({ _id: eventId });
    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found.' });
      return;
    }
    if (event.status === 'approved' && event.startAt <= new Date()) {
      res.status(409).json({ success: false, message: 'Registration can no longer be cancelled after the event starts.' });
      return;
    }
    const registration = await db.collection('communityRegistrations').findOneAndUpdate(
      { eventId, participantUid: req.user.uid, status: 'registered' },
      { $set: { status: 'cancelled', updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!registration) {
      res.status(404).json({ success: false, message: 'Active registration not found.' });
      return;
    }
    await db.collection('communityEvents').updateOne(
      { _id: eventId, registrationCount: { $gt: 0 } },
      { $inc: { registrationCount: -1 } },
    );
    res.json({ success: true, registration: { status: 'cancelled' } });
  });

  const getMyRegistration = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const registration = await getDb().collection('communityRegistrations').findOne({
      eventId: new ObjectId(req.params.eventId),
      participantUid: req.user.uid,
    });
    if (!registration) {
      res.status(404).json({ success: false, code: 'REGISTRATION_NOT_FOUND', message: 'Registration not found.' });
      return;
    }
    res.json({
      success: true,
      registration: {
        status: registration.status,
        registeredAt: registration.registeredAt,
      },
    });
  });

  const listMyRegistrations = asyncRoute(async (req, res) => {
    const pagination = registrationQuerySchema.safeParse(req.query);
    if (!pagination.success) return invalid(res, pagination);
    const db = getDb();
    const filter = { participantUid: req.user.uid };
    const [registrations, total] = await Promise.all([
      db.collection('communityRegistrations').find(filter)
      .sort({ registeredAt: -1 })
      .skip((pagination.data.page - 1) * pagination.data.limit)
      .limit(pagination.data.limit)
      .toArray(),
      db.collection('communityRegistrations').countDocuments(filter),
    ]);
    const history = await Promise.all(registrations.map(async (registration) => {
      const event = await db.collection('communityEvents').findOne({
        _id: registration.eventId,
        status: { $in: ['approved', 'cancelled'] },
      });
      if (!event) return null;
      const organizer = await db.collection('communityOrganizers').findOne({
        firebaseUid: event.organizerUid,
        status: 'approved',
      });
      if (!organizer) return null;
      return {
        id: registration._id.toString(),
        status: registration.status,
        registeredAt: registration.registeredAt,
        event: eventResponse(event, organizer, { publicView: true }),
      };
    }));
    res.json({
      success: true,
      count: history.filter(Boolean).length,
      total,
      page: pagination.data.page,
      limit: pagination.data.limit,
      registrations: history.filter(Boolean),
    });
  });

  const listOrganizerApplications = asyncRoute(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    if (!organizerStatuses.includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid organizer status.' });
      return;
    }
    const organizers = await getDb().collection('communityOrganizers')
      .find({ status })
      .sort({ submittedAt: 1 })
      .toArray();
    res.json({
      success: true,
      count: organizers.length,
      organizers: organizers.map((organizer) => organizerResponse(organizer, true)),
    });
  });

  const reviewOrganizer = asyncRoute(async (req, res) => {
    if (req.params.uid === req.user.uid) {
      res.status(403).json({ success: false, message: 'Administrators cannot review their own organizer application.' });
      return;
    }
    const result = adminReviewSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);
    const { status, reviewNote } = result.data;
    const now = new Date();
    const db = getDb();
    const organizer = await db.collection('communityOrganizers').findOneAndUpdate(
      { firebaseUid: req.params.uid, status: { $in: ['pending', 'changes_requested', 'rejected'] } },
      {
        $set: {
          status,
          reviewNote: status === 'approved' ? null : reviewNote,
          reviewedBy: req.user.uid,
          reviewedAt: now,
          updatedAt: now,
          approvedAt: status === 'approved' ? now : null,
        },
      },
      { returnDocument: 'after' },
    );
    if (!organizer) {
      res.status(404).json({ success: false, message: 'Organizer application not found or not reviewable.' });
      return;
    }
    await db.collection('communityModerationLogs').insertOne({
      subjectType: 'organizer',
      subjectId: organizer.firebaseUid,
      subjectUid: organizer.firebaseUid,
      decision: status,
      reason: organizer.reviewNote,
      reviewedBy: req.user.uid,
      reviewedAt: now,
      createdAt: now,
    });
    res.json({ success: true, organizer: organizerResponse(organizer, true) });
  });

  const listEventsForReview = asyncRoute(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending_review';
    if (!['pending_review', 'approved', 'rejected', 'changes_requested', 'cancelled', 'completed'].includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid event status.' });
      return;
    }
    const events = await getDb().collection('communityEvents').find({ status })
      .sort({ updatedAt: 1 }).toArray();
    const organizers = getDb().collection('communityOrganizers');
    const result = await Promise.all(events.map(async (event) => {
      const organizer = await organizers.findOne({ firebaseUid: event.organizerUid });
      return eventResponse(event, organizer);
    }));
    res.json({ success: true, count: result.length, events: result });
  });

  const reviewEvent = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const result = adminReviewSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);
    const { status, reviewNote } = result.data;
    const db = getDb();
    const filter = { _id: new ObjectId(req.params.eventId), status: 'pending_review' };
    const current = await db.collection('communityEvents').findOne(filter);
    if (!current) {
      res.status(404).json({ success: false, message: 'Pending event not found.' });
      return;
    }
    if (current.organizerUid === req.user.uid) {
      res.status(403).json({ success: false, message: 'Administrators cannot review their own events.' });
      return;
    }
    const organizer = await db.collection('communityOrganizers').findOne({
      firebaseUid: current.organizerUid,
    });
    if (status === 'approved' && organizer?.status !== 'approved') {
      res.status(409).json({
        success: false,
        message: 'The event organizer must be approved before this event can be published.',
      });
      return;
    }
    const now = new Date();
    const event = await db.collection('communityEvents').findOneAndUpdate(
      filter,
      {
        $set: {
          status,
          reviewNote: status === 'approved' ? null : reviewNote,
          reviewedBy: req.user.uid,
          reviewedAt: now,
          updatedAt: now,
          publishedAt: status === 'approved' ? now : null,
        },
      },
      { returnDocument: 'after' },
    );
    if (!event) {
      res.status(404).json({ success: false, message: 'Pending event not found.' });
      return;
    }
    await db.collection('communityModerationLogs').insertOne({
      subjectType: 'event',
      subjectId: event._id,
      subjectUid: event.organizerUid,
      decision: status,
      reason: event.reviewNote,
      reviewedBy: req.user.uid,
      reviewedAt: now,
      createdAt: now,
    });
    res.json({ success: true, event: eventResponse(event, organizer) });
  });

  const listPublicEvents = asyncRoute(async (req, res) => {
    const result = publicEventQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, result);
    const query = result.data;
    const filter = eventQueryFilter(query);
    const collection = getDb().collection('communityEvents');
    let events;
    let total;
    if (query.sortBy === 'distance') {
      const countFilter = eventQueryFilter({ ...query, sortBy: 'date' });
      [events, total] = await Promise.all([
        collection.find(filter).skip((query.page - 1) * query.limit)
          .limit(query.limit).toArray(),
        collection.countDocuments(countFilter),
      ]);
    } else {
      [events, total] = await Promise.all([
        collection.find(filter).sort({ startAt: 1 }).skip((query.page - 1) * query.limit)
          .limit(query.limit).toArray(),
        collection.countDocuments(filter),
      ]);
    }
    const organizers = getDb().collection('communityOrganizers');
    const publicEvents = await Promise.all(events.map(async (event) => {
      const organizer = await organizers.findOne({
        firebaseUid: event.organizerUid,
        status: 'approved',
      });
      return organizer ? eventResponse(event, organizer, { publicView: true }) : null;
    }));
    const filtered = publicEvents.filter(Boolean);
    res.json({
      success: true,
      count: filtered.length,
      total,
      page: query.page,
      limit: query.limit,
      events: filtered,
    });
  });

  const getPublicEvent = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.eventId)) {
      res.status(400).json({ success: false, message: 'Invalid event ID.' });
      return;
    }
    const db = getDb();
    const event = await db.collection('communityEvents').findOne({
      _id: new ObjectId(req.params.eventId),
      status: { $in: ['approved', 'cancelled'] },
    });
    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found.' });
      return;
    }
    const organizer = await db.collection('communityOrganizers').findOne({
      firebaseUid: event.organizerUid,
      status: 'approved',
    });
    if (!organizer) {
      res.status(404).json({ success: false, message: 'Event not found.' });
      return;
    }
    res.json({ success: true, event: eventResponse(event, organizer, { publicView: true }) });
  });

  return {
    applyAsOrganizer,
    getMyOrganizer,
    getOrganizerSummary,
    updateMyOrganizer,
    createEvent,
    listMyEvents,
    getMyEvent,
    updateMyEvent,
    submitMyEvent,
    cancelMyEvent,
    listEventRegistrations,
    registerForEvent,
    cancelRegistration,
    getMyRegistration,
    listMyRegistrations,
    listOrganizerApplications,
    reviewOrganizer,
    listEventsForReview,
    reviewEvent,
    listPublicEvents,
    getPublicEvent,
  };
}
