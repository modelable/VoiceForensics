const express = require('express')
const router = express.Router()
const { ensureAuthenticated, forwardAuthenticated } = require('./auth')

router.get('/', forwardAuthenticated, (req, res) => {
    res.render('index')
})

router.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.render('dashboard', {
        name: req.user.name
    })
})

module.exports = router