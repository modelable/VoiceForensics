const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const mongoose = require('mongoose')
const passport = require('passport')
const { forwardAuthenticated } = require('./auth')

// Use Models
const User = require('../models/user') 
const db = mongoose.connection;

//수정 -> MongoDB Atlas(클라우드)에 연결
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

mongoose.connect(uri);

// Login page
router.get('/login', forwardAuthenticated, (req, res) => {
    res.render('login')
})

// Login handle
router.post('/login', (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/users/login',
        failureFlash: true
    })(req, res, next)
})

// Register page
router.get('/register', forwardAuthenticated, (req, res) => {
    res.render('register')
})

// Router page in post
router.post('/register', (req, res) => {
    const { name, email, password, password2 } = req.body
    let errors = []
    // Check passwordd match
    if (password !== password2) {
        errors.push({ msg: 'Passwords do not match' })
    }
    // Check password's length
    if (password.length < 4) {
        errors.push({ msg: 'Password should be at least 4 characters' })
    }
    // Error messages
    if (errors.length > 0) {
        res.render('register', {
            errors, 
            name, email, password, password2
        })
    } else {
        // Validation passed
        User.findOne({ email: email})
            .then(user => {
                if(user) {
                    //User exists
                    errors.push({ msg: 'Email is already registered'})
                    res.render('register', {
                        errors,
                        name, email, password, password2
                    })
                } else {
                    const newUser = new User({
                        name, email, password
                    })
                    // Hash Password
                    bcrypt.hash(newUser.password, 10, (err,hash) => {
                        if(err) throw err;
                        newUser.password = hash
                        newUser.save()
                            .then(user => {
                                req.flash('success_msg', 'Your are now registered and can log in ')
                                res.redirect('/users/login')
                            })
                            .catch(err => console.log(err))
                    })         
        }
    })
}})

router.get('/logout', (req, res) => {
    req.logout(() => {})
    req.flash('success_msg', 'You are logged out')
    res.redirect('/users/login')
})

module.exports = router