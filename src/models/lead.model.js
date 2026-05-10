import mongoose from "mongoose";

export const REJECTION_REASONS = ["price", "time", "other_center", "other"];

export const HISTORY_TYPES = [
  "status_change",
  "note",
  "contact",
  "follow_up_set",
  "trial_set",
  "converted",
  "reassigned",
];

const historySchema = new mongoose.Schema(
  {
    type: { type: String, enum: HISTORY_TYPES, required: true },
    fromStatus: { type: mongoose.Schema.Types.ObjectId, ref: "LeadStatus" },
    toStatus: { type: mongoose.Schema.Types.ObjectId, ref: "LeadStatus" },
    message: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const leadSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, required: true, index: true },
    birthDate: { type: Date, default: null },

    source: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadSource",
      default: null,
      index: true,
    },
    direction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadDirection",
      default: null,
      index: true,
    },
    status: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadStatus",
      required: true,
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    requestDate: { type: Date, default: Date.now },

    trialDate: { type: Date, default: null },
    trialGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },

    convertedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    convertedAt: { type: Date, default: null },

    rejectionReason: {
      type: String,
      enum: [...REJECTION_REASONS, null],
      default: null,
    },
    rejectionNote: { type: String, default: "" },

    followUpDate: { type: Date, default: null, index: true },
    followUpNote: { type: String, default: "" },

    contactCount: { type: Number, default: 0, min: 0 },
    lastContactAt: { type: Date, default: null },

    history: { type: [historySchema], default: [] },

    reminderSentAt: { type: Date, default: null },
    notes: { type: String, default: "" },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ createdAt: -1 });

leadSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
