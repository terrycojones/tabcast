#!/usr/bin/env node

var express = require('express'),
    redis = require('redis'),
    db = redis.createClient(),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server);

io.configure('production', function(){
    io.enable('browser client minification');
    io.enable('browser client etag');
    io.enable('browser client gzip');
    io.set('log level', 1);
    io.set('transports', [
        'websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling'
    ]);
});

io.configure('development', function(){
    io.set('transports', ['websocket']);
    io.set('log level', 1);
});

db.on('error', function(err) {
    console.log('Redis error: ' + err);
});

app.configure(function() {
    var pub = __dirname + '/public';
    app.use(express.logger('dev'));
    app.use(express.static(pub));
    app.use(express.bodyParser());
    app.use(express.errorHandler());
    app.use(express.favicon(__dirname + '/public/images/favicon.ico'));
    app.set('view engine', 'jade');
    // app.set('view engine', 'ejs');
});

app.get('/track/:group', function(req, res){
    console.log('Got /track request for group=' + req.params.group);
    // Send back some recent URLs, for now.
    db.zrevrange(
        'urls', 0, 1000, 'withscores',
        function(err, urls){
            if (err){
                return res.send(500);
            }
            return res.send(urls);
        }
    );
});

app.get('/', function(req, res){
    db.zrevrange(
        'urls', 0, 1000, 'withscores',
        function(err, urls){
            if (err){
                return res.send(500);
            }
            return res.send(urls);
        }
    );
});

server.listen(9999, '0.0.0.0');

io.sockets.on('connection', function (socket){
    var date = new Date();
    console.log(date.toUTCString() + ' - connection received');
    socket.on('track', function(group){
        console.log('Tracking ' + group);
        socket.join(group);
        // Send just this socket the last URL (if any) for the group.
        db.zrange(
            'group:' + group + ':urls', 0, 1,
            function(err, urls){
                if (err){
                    console.log('Error getting last URL for group ' + group, err);
                }
                else {
                    if (urls.length){
                        socket.emit('url', {
                            group: group,
                            url: urls[0]
                        });
                    }
                }
            }
        );
    });

    socket.on('url', function(data){
        console.log('Received url ' + data.url + ' for group ' + data.group);
        checkPassword(data, function(valid){
            if (valid){
                var date = Date.now();
                db.zadd('group:' + data.group + ':urls', date, data.url);
                delete data['password'];
                io.sockets.in(data.group).emit('url', data);
            }
            else {
                console.log('Incorrect auth details for user "' + data.username +
                            '" sending url ' + data.url + ' to group ' +
                            data.group);
                socket.emit('authentication failed', data);
            }
        });
    });
    socket.on('disconnect', function (){
        var date = new Date();
        console.log(date.toUTCString() + ' - client disconnect');
    });
});


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

var checkPassword = function(data, callback){
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

console.log('Server running at http://127.0.0.1:9999/');
