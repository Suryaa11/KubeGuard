const mongoose = require('mongoose')

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    createdBy: { type: String, required: true },
    createdByEmail: { type: String, required: true },
    githubRepoUrl: {
      type: String,
      required: true,
      validate: {
        validator: (value) => value.startsWith('https://github.com/'),
        message: 'Must be a valid GitHub URL starting with https://github.com/',
      },
    },
    branch: { type: String, required: true, default: 'main' },
    folderPath: {
      type: String,
      required: true,
      default: '/helm',
      validate: {
        validator: (value) => value.startsWith('/'),
        message: 'Folder path must start with /',
      },
    },
    prometheusUrl: { type: String, required: true },
    prometheusAvailable: { type: Boolean, default: false },
    argocdUrl: { type: String, required: true },
    argocdAppName: { type: String, required: true },
    argocdToken: { type: String, required: true },
    kubernetesToken: { type: String, default: null },
    kubernetesApiUrl: { type: String, default: null },
    webhookSecret: { type: String, required: true, select: false },
    githubWebhookId: { type: Number, default: null },
    status: {
      type: String,
      enum: ['active', 'paused', 'error'],
      default: 'active',
    },
    lastEventAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
)

projectSchema.index({ githubRepoUrl: 1, branch: 1, folderPath: 1 }, { unique: true })
projectSchema.index({ createdBy: 1 })
projectSchema.index({ status: 1 })

projectSchema.methods.toSafeJSON = function () {
  const obj = this.toObject()
  delete obj.webhookSecret
  delete obj.argocdToken
  delete obj.kubernetesToken
  return obj
}

module.exports = mongoose.model('Project', projectSchema, 'projects')
