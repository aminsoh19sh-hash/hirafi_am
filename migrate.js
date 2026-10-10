require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const F = path.join(__dirname, 'data/db.json');

(async () => {
    const data = JSON.parse(fs.readFileSync(F, 'utf8'));
    await mongoose.connect(process.env.MONGODB_URI);

    const Craftsman = mongoose.model('Craftsman', new mongoose.Schema({ _id: String }, { strict: false, _id: false }));
    const Customer = mongoose.model('Customer', new mongoose.Schema({ _id: String }, { strict: false, _id: false }));
    const Appointment = mongoose.model('Appointment', new mongoose.Schema({ _id: String }, { strict: false, _id: false }));
    const Event = mongoose.model('Event', new mongoose.Schema({ _id: String }, { strict: false, _id: false }));

    const mapIds = (arr) => arr.map(x => ({ ...x, _id: x.id || x._id, id: undefined }));

    const insert = async (Model, arr, name) => {
        if (!arr?.length) return console.log(`${name}: 0`);
        await Model.insertMany(mapIds(arr), { ordered: false }).catch(e => console.log(`${name} partial:`, e.message));
        console.log(`${name}: ${arr.length} inserted`);
    };

    await insert(Craftsman, data.craftsmen, 'craftsmen');
    await insert(Customer, data.customers, 'customers');
    await insert(Appointment, data.appointments, 'appointments');
    await insert(Event, data.events, 'events');

    console.log('✅ Migration done');
    process.exit(0);
})();