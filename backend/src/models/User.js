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
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
