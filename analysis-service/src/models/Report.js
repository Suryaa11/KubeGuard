const mongoose = require('mongoose')

const reportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true, index: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, unique: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    projectName: { type: String, required: true },
    riskScore: { type: Number, required: true },
    recommendation: { type: String, required: true },
    changesSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    reportBlobPath: { type: String, required: true },
    reportBlobUrl: { type: String, required: true },
    metricsAvailable: { type: Boolean, default: false },
    adminDecision: { type: String, default: 'pending' },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: String, default: null },
    decidedByEmail: { type: String, default: null },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

reportSchema.index({ projectId: 1, generatedAt: -1 })
reportSchema.index({ riskScore: 1 })
reportSchema.index({ adminDecision: 1 })

module.exports = mongoose.model('Report', reportSchema, 'reports')
