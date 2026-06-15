const mongoose = require('mongoose')

const semanticChangeSchema = new mongoose.Schema(
  {
    file: { type: String, default: '' },
    fieldPath: { type: String, default: '' },
    oldValue: { type: String, default: '' },
    newValue: { type: String, default: '' },
    changeType: {
      type: String,
      enum: ['increase', 'decrease', 'added', 'removed', 'modified'],
      required: true,
    },
    isCriticalField: { type: Boolean, default: false },
  },
  { _id: false }
)

const eventSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName: { type: String, required: true },
    projectOwnerId: { type: String, default: '' },
    commitSha: { type: String, required: true },
    commitMessage: { type: String, default: '' },
    commitUrl: { type: String, default: '' },
    author: { type: String, default: '' },
    authorEmail: { type: String, default: '' },
    changedFiles: { type: [String], default: [] },
    monitoredChangedFiles: { type: [String], default: [] },
    semanticChanges: { type: [semanticChangeSchema], default: [] },
    rawDiff: { type: String, default: '' },
    status: {
      type: String,
      enum: ['detected', 'analyzing', 'pending_approval', 'approved', 'rejected', 'error'],
      default: 'detected',
    },
    argocdPaused: { type: Boolean, default: false },
    argocdPauseError: { type: String, default: '' },
    reportBlobUrl: { type: String, default: '' },
    detectedAt: { type: Date, default: Date.now },
    analysisStartedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

eventSchema.index({ projectId: 1 })
eventSchema.index({ status: 1 })
eventSchema.index({ detectedAt: -1 })
eventSchema.index({ projectId: 1, detectedAt: -1 })

module.exports = mongoose.model('Event', eventSchema, 'events')
