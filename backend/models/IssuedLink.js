const mongoose = require('mongoose');
// Retain hashes of every short link ever issued so an old link can never point to another client later.
const schema = new mongoose.Schema({_id:{type:String},issuedAt:{type:Date,default:Date.now}});
module.exports = mongoose.model('IssuedLink',schema);
