const mongoose = require('mongoose')

const reportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true },
    eventId: { type: String, required: true },
    projectId: { type: String, required: true },
    projectName: { type: String },
    riskScore: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    recommendation: {
      type: String,
      enum: ['approve', 'approve_with_caution', 'reject'],
      required: true,
    },
    reportBlobPath: { type: String },
    reportBlobUrl: { type: String },
    generatedAt: { type: Date, default: Date.now },
    adminDecision: { type: String, enum: ['approved', 'rejected', null], default: null },
    decidedAt: { type: Date },
    decidedBy: { type: String },
    decidedByEmail: { type: String },
    decisionNote: { type: String },
    changesSummary: { type: String },
    ownerId: { type: String },
  },
  { timestamps: true }
)

reportSchema.index({ projectId: 1 })
reportSchema.index({ riskScore: 1 })
reportSchema.index({ generatedAt: -1 })
reportSchema.index({ adminDecision: 1 })
reportSchema.index({ eventId: 1 }, { unique: true })

module.exports = mongoose.model('Report', reportSchema, 'reports')
