function ensureAuthenticated(req, res, next) {
    if(req.isAuthenticated()) {
        return next()
    }
    req.flash('error_msg', 'Please login in to view this resource')
    res.redirect('/users/login')
}

function forwardAuthenticated(req, res, next) {
    if(req.isAuthenticated()) {
        res.redirect('/dashboard')
    }
    return next()
}

module.exports = { ensureAuthenticated, forwardAuthenticated }