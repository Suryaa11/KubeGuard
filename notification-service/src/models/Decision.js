const mongoose = require('mongoose')

const decisionSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    projectId: { type: String, required: true },
    reportBlobUrl: { type: String },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    decidedBy: { type: String, required: true },
    decidedByEmail: { type: String },
    decisionNote: { type: String },
    decidedAt: { type: Date, default: Date.now },
    argocdResumed: { type: Boolean, default: false },
    argocdResumeError: { type: String },
    emailSentAt: { type: Date },
    emailRecipients: [{ type: String }],
    source: { type: String, enum: ['email', 'dashboard'], default: 'dashboard' },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
)

decisionSchema.index({ projectId: 1 })
decisionSchema.index({ decidedAt: -1 })
decisionSchema.index({ decidedBy: 1 })

module.exports = mongoose.model('Decision', decisionSchema, 'decisions')
