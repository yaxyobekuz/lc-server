import mongoose from "mongoose";

// Refresh tokens are stored hashed so a session can be revoked DB-side
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { timestamps: true },
);

// TTL index - Mongo evicts expired tokens automatically
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshToken;
