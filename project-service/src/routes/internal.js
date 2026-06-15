const router = require('express').Router()
const Project = require('../models/Project')
const { decrypt } = require('../utils/encrypt')
const { checkInternal } = require('../middleware/checkInternal')

router.get('/projects/:id', checkInternal, async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).select('+webhookSecret')
    if (!project) {
      return res.status(404).json({ error: 'NotFound', message: 'Project not found.' })
    }

    const obj = project.toObject()
    obj.argocdToken = decrypt(obj.argocdToken)
    obj.kubernetesToken = decrypt(obj.kubernetesToken)
    return res.json({ project: obj })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
