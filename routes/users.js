const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const mongoose = require('mongoose')
const passport = require('passport')
const { forwardAuthenticated } = require('./auth')

// Use Models
const User = require('../models/User') 
const db = mongoose.connection;

//수정 -> MongoDB Atlas(클라우드)에 연결
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
mongoose.connect(uri);

//0918 수정, MongoDB 로컬에 연결
//mongoose.connect('mongodb://localhost:27017/mydatabase');

// Login page
router.get('/login', forwardAuthenticated, (req, res) => {
    res.render('login')
})

// Login handle
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return next(err);  // 에러 처리
        }
        if (!user) {
            // 사용자 인증 실패
            res.send(`
                <script>
                    alert('ID가 존재하지 않거나, PW가 일치하지 않습니다');
                    window.history.back(); // Redirects back to the previous page
                </script>
            `);
            return res.redirect('/users/login');
        }
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            // 로그인 성공 후 사용자 ID를 세션에 저장
            req.session.userId = user._id;
            //return res.redirect('/dashboard');  // 성공적으로 로그인 처리 후 대시보드로 리다이렉트
            return res.redirect('/');
        });
    })(req, res, next);
});

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
                        name: name,
                        email: email,
                        password: password,
                        files_control_id: null,  // 명시적으로 null을 할당
                        files_record_id: null    // 명시적으로 null을 할당
                    });
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