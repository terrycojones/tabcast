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
    // io.set('log level', 1);
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

var lastUrlForGroup = {};

io.sockets.on('connection', function (socket){
    console.log('connection');
    socket.on('track', function(group){
        console.log('Tracking ' + group);
        socket.join(group);
        // Send just this socket the last URL (if any) for the group.
        if (lastUrlForGroup[group]){
            socket.emit('url', {
                group: group,
                url: lastUrlForGroup[group]
            });
        }
    });

    socket.on('url', function(data){
        console.log('Received url ' + data.url + ' for group ' + data.group);
        lastUrlForGroup[data.group] = data.url;
        var date = Date.now();
        db.zadd('urls', date, data.url);
        delete data['password'];
        io.sockets.in(data.group).emit('url', data);
    });
    socket.on('disconnect', function (){
        console.log('client disconnect');
    });
});

console.log('Server running at http://127.0.0.1:9999/');
