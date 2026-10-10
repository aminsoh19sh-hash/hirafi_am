const mongoose = require('mongoose');

/* ---------- Schemas ---------- */
const CraftsmanSchema = new mongoose.Schema({
    _id: String,
    email: { type: String, unique: true, index: true },
    pass: String,
    fullName: String,
    phone: String,
    city: { type: String, index: true },
    address: String,
    trade: String,
    status: { type: String, default: 'incomplete', index: true },
    rating: { type: Number, default: 5 },
    available: { type: Boolean, default: true },
    createdAt: { type: String, default: () => new Date().toISOString() }
}, { _id: false });

const CustomerSchema = new mongoose.Schema({
    _id: String,
    email: { type: String, unique: true, index: true },
    pass: String,
    fullName: String,
    phone: String,
    address: String,
    createdAt: { type: String, default: () => new Date().toISOString() }
}, { _id: false });

const AppointmentSchema = new mongoose.Schema({
    _id: String,
    customerId: { type: String, index: true },
    craftsmanId: { type: String, index: true },
    craftsmanName: String,
    customerName: String,
    phone: String,
    address: String,
    date: String,
    note: String,
    status: { type: String, default: 'pending', index: true },
    createdAt: { type: String, default: () => new Date().toISOString() }
}, { _id: false });

const EventSchema = new mongoose.Schema({
    _id: String,
    type: String,
    text: String,
    at: { type: String, default: () => new Date().toISOString() }
}, { _id: false });

const Craftsman = mongoose.model('Craftsman', CraftsmanSchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const Appointment = mongoose.model('Appointment', AppointmentSchema);
const Event = mongoose.model('Event', EventSchema);

/* ---------- Helpers ---------- */
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const MODELS = { craftsmen: Craftsman, customers: Customer, appointments: Appointment, events: Event };

/* Connection is cached on `global` so warm serverless invocations (Vercel) reuse it */
const g = global.__hirafiMongo || (global.__hirafiMongo = { promise: null });
const connect = async () => {
    if (mongoose.connection.readyState === 1) return;
    if (!g.promise) {
        g.promise = mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hirafi', {
            serverSelectionTimeoutMS: 8000,
            maxPoolSize: 5,
            bufferCommands: false
        }).then(() => console.log('✅ MongoDB connected')).catch(e => { g.promise = null; throw e; });
    }
    await g.promise;
};

/* ---------- DB Facade ----------
   The whole dataset is loaded from MongoDB at the start of every API request (see middleware in server.js),
   mutated in memory by the route handlers, and written back BEFORE the response is sent.
   Only documents that actually changed are written, and only ids that existed at load time can be deleted,
   so two server instances can never wipe each other's data. */
let _cache = null;
let _snap = null;      // { collection: Map(_id -> JSON) } taken right after load
let _dirty = false;

const snapshot = (d) => {
    const s = {};
    for (const k of Object.keys(MODELS)) s[k] = new Map(d[k].map(x => [x._id, JSON.stringify(x)]));
    return s;
};

const ensureCache = async (force = false) => {
    if (_cache && !force) return _cache;
    const [craftsmen, customers, appointments, events] = await Promise.all([
        Craftsman.find().lean(),
        Customer.find().lean(),
        Appointment.find().sort({ _id: -1 }).lean(),
        Event.find().sort({ _id: -1 }).limit(100).lean()
    ]);
    _cache = {
        craftsmen: craftsmen.map(c => ({ ...c, id: c._id })),
        customers: customers.map(c => ({ ...c, id: c._id })),
        appointments: appointments.map(a => ({ ...a, id: a._id })),
        events: events.map(e => ({ ...e, id: e._id }))
    };
    _snap = snapshot(_cache);
    _dirty = false;
    return _cache;
};

const load = () => {
    if (!_cache) throw new Error('DB not ready. Call await connect() and await ensureCache() before starting the server.');
    return _cache;
};

/* Mark data as changed. The actual write happens in flush(), before the HTTP response is sent. */
const save = (d) => { _cache = d; _dirty = true; };

const flush = async () => {
    if (!_dirty) return;
    const d = _cache, snap = _snap;
    for (const [key, Model] of Object.entries(MODELS)) {
        const before = snap[key], now = new Set();
        const ops = [];
        for (const x of d[key]) {
            now.add(x._id);
            if (before.get(x._id) !== JSON.stringify(x)) {
                ops.push({ updateOne: { filter: { _id: x._id }, update: { $set: x }, upsert: true } });
            }
        }
        if (ops.length) await Model.bulkWrite(ops, { ordered: false });
        const removed = [...before.keys()].filter(k => !now.has(k));
        if (removed.length) await Model.deleteMany({ _id: { $in: removed } });
    }
    _snap = snapshot(d);
    _dirty = false;
};

const log = (d, type, text) => {
    d.events.unshift({ _id: id(), type, text, at: new Date().toISOString() });
    d.events = d.events.slice(0, 100);
};

module.exports = { connect, ensureCache, load, save, flush, id, log, Craftsman, Customer, Appointment, Event };