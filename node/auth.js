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
