var redis = require('redis'),
    db = redis.createClient();

var getPassword = function(username, group, callback){
    db.get('password:' + group + ':username', function(err, password){
        callback(password);
    });
};

var setPassword = function(username, password, group, callback){
    db.set('password:' + group + ':username', password, function(){
        callback();
    });
};

exports.checkPassword = function(data, callback){
    if (data.username){
        if (data.password){
            getPassword(data.username, data.group, function(storedPassword){
                if (storedPassword){
                    callback(data.password === storedPassword);
                }
                else {
                    // First time we've seen a password from this user.
                    setPassword(
                        data.username, data.password, data.group, function(){
                            callback(true);
                        }
                    );
                }
            });
        }
        else {
            // A user sending no password is ok, as long as no
            // password has previously been given for the user.
            getPassword(data.username, function(password){
                callback(password ? false : true);
            });
        }
    }
    else {
        // Anon request, always OK.
        callback(true);
    }
};
