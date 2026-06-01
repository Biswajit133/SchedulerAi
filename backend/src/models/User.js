const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email:   { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:    { type: String },
    picture: { type: String },
    googleTokens: {
      access_token:  String,
      refresh_token: String,
      expiry_date:   Number,
      scope:         String,
      token_type:    String,
    },
    zoomTokens: {
      access_token:  String,
      refresh_token: String,
      expiry_date:   Number,
      token_type:    String,
      scope:         String,
    },
    zoomUser: {
      email:   String,
      name:    String,
      id:      String,
      picture: String,
    },
    timezone: { type: String, default: null }, // e.g. "Asia/Kolkata" from Google Calendar
    contacts: [
      {
        name:           { type: String, required: true, trim: true },
        email:          { type: String, required: true, lowercase: true, trim: true },
        previousEmails: [{ type: String, lowercase: true }],
        meetingCount:   { type: Number, default: 0 },
        lastUsedDate:   { type: Date, default: null },
        savedAt:        { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
