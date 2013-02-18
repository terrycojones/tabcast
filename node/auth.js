var redis = require('redis'),
    db = redis.createClient(),
    bcrypt = require('bcrypt');

var keyForUserPlusGroup = function(username, group){
    return 'password:' + group + ':' + username;
};

var keyForGroup = function(group){
    return 'groupPassword:' + group;
};

var getPassword = function(key, callback){
    db.get(key, function(err, password){
        callback(password);
    });
};

var setPassword = function(key, password, callback){
    bcrypt.genSalt(function(err, salt){
        if (err){
            callback(err);
        }
        else {
            bcrypt.hash(password, salt, function(err, hashedPassword){
                if (err){
                    callback(err);
                }
                else {
                    db.set(key, hashedPassword, function(){
                        callback();
                    });
                }
            });
        }
    });
};

var checkPassword = function(data, callback){
    var username = data.username || 'anon',
        key = keyForUserPlusGroup(username, data.group);
    if (data.password){
        getPassword(key, function(storedPassword){
            if (storedPassword){
                bcrypt.compare(
                    data.password, storedPassword,
                    function(err, result){
                        callback(err ? false : result);
                    }
                );
            }
            else {
                // First time we've seen a password from this user.
                setPassword(key, data.password, function(err){
                        callback(err ? false : true);
                    }
                );
            }
        });
    }
    else {
        // A user sending no password is ok, as long as no
        // password has previously been given for the user.
        getPassword(key, function(password){
            callback(password ? false : true);
        });
    }
};

var checkGroupPassword = function(data, callback){
    var group = data.group,
        key = keyForGroup(group);
    if (data.groupPassword){
        getPassword(key, function(storedPassword){
            if (storedPassword){
                bcrypt.compare(
                    data.groupPassword, storedPassword,
                    function(err, result){
                        callback(err ? false : result);
                    }
                );
            }
            else {
                // First time we've seen a password for this group.
                setPassword(key, data.groupPassword, function(err){
                    callback(err ? false : true);
                });
            }
        });
    }
    else {
        // Sending no group password is ok, as long as no
        // password has previously been given for the group.
        getPassword(key, function(password){
            callback(password ? false : true);
        });
    }
};

exports.check = function(data, callback){
    checkGroupPassword(data, function(groupValid){
        if (groupValid){
            checkPassword(data, function(userValid){
                callback(userValid);
            });
        }
        else {
            callback(false);
        }
    });
};

exports.basic = function(req, res, next){
    var group = req.params.group;
    var requestAuth = function(){
        res.header(
            'WWW-Authenticate',
            'Basic realm="Tabcast group ' + "'" + group + "'" + '"'
        );
        setTimeout(function(){
            res.send('Authentication required', 401);
        }, req.headers.authorization ? 5000 : 0);
    };

    getPassword(keyForGroup(group), function(groupPassword){
        if (groupPassword){
            // The group has a password, so we require authentication.
            var credentials, data;
            if (req.headers.authorization && req.headers.authorization.search('Basic ') === 0){
                credentials = new Buffer(req.headers.authorization.split(' ')[1], 'base64')
                    .toString().split(':');
                data = {
                    group: group,
                    password: credentials[1],
                    username: credentials[0]
                };
                checkPassword(data, function(userValid){
                    if (userValid){
                        next();
                    }
                    else {
                        requestAuth();
                    }
                });
            }
            else {
                requestAuth();
            }
        }
        else {
            // Group has no password.
            next();
        }
    });
};
