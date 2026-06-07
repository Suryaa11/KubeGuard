const mongoose = require('mongoose')

const semanticChangeSchema = new mongoose.Schema(
  {
    file: String,
    fieldPath: String,
    oldValue: String,
    newValue: String,
    changeType: {
      type: String,
      enum: ['increase', 'decrease', 'added', 'removed', 'modified'],
    },
    isCriticalField: { type: Boolean, default: false },
  },
  { _id: false }
)

const eventSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    projectName: { type: String, required: true },
    commitSha: { type: String, required: true },
    commitMessage: { type: String, default: '' },
    commitUrl: { type: String, default: '' },
    author: { type: String, default: '' },
    authorEmail: { type: String, default: '' },
    changedFiles: [String],
    monitoredChangedFiles: [String],
    semanticChanges: [semanticChangeSchema],
    rawDiff: { type: String, default: '' },
    status: {
      type: String,
      enum: ['detected', 'analyzing', 'pending_approval', 'approved', 'rejected', 'error'],
      default: 'detected',
      index: true,
    },
    argocdPaused: { type: Boolean, default: false },
    argocdPauseError: { type: String, default: null },
    reportBlobUrl: { type: String, default: null },
    detectedAt: { type: Date, default: Date.now, index: true },
    analysisStartedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

eventSchema.index({ projectId: 1, detectedAt: -1 })

module.exports = mongoose.model('Event', eventSchema, 'events')
