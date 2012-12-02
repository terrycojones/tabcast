var redis = require('redis'),
    db = redis.createClient(),
    bcrypt = require('bcrypt');

var keyForUserPlusGroup = function(username, group){
    return 'password:' + group + ':' + username;
};

var getPassword = function(username, group, callback){
    db.get(keyForUserPlusGroup(username, group), function(err, password){
        callback(password);
    });
};

var setPassword = function(username, password, group, callback){
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
                    db.set(
                        keyForUserPlusGroup(username, group), hashedPassword,
                        function(){
                            callback();
                        }
                    );
                }
            });
        }
    });
};

exports.checkPassword = function(data, callback){
    var username = data.username || 'anon';
    if (data.password){
        getPassword(username, data.group, function(storedPassword){
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
                setPassword(
                    username, data.password, data.group, function(err){
                        callback(err ? false : true);
                    }
                );
            }
        });
    }
    else {
        // A user sending no password is ok, as long as no
        // password has previously been given for the user.
        getPassword(username, data.group, function(password){
            console.log('got stored password: ' + password);
            callback(password ? false : true);
        });
    }
};
