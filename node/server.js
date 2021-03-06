#!/usr/bin/env node

var port = 9999,
    express = require('express'),
    redis = require('redis'),
    db = redis.createClient(),
    app = express(),
    server = require('http').createServer(app);

require('./sockets.js').init(db, server);

db.on('error', function(err) {
    console.log('Redis error: ' + err);
});

app.configure(function() {
    var pub = __dirname + '/public';
    app.use(express.logger('dev'));
    app.use(express.static(pub));
    app.use(express.favicon(__dirname + '/public/favicon.ico'));
    app.set('view engine', 'jade');
});

app.configure('development', function(){
    app.use(express.errorHandler({
        dumpExceptions: true,
        showStack: true
    }));
});

app.configure('production', function(){
    app.use(express.errorHandler());
    // Set 'trust proxy' to true if we're sitting behind a proxy, e.g.,
    // nginx.
    app.enable('trust proxy');
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

app.get('/view/:group', function(req, res){
    var group = req.params.group,
        username = req.query.username;
    console.log('Got /view request for group=' + group);
    console.log('username: ', username);
    var userPrefix = username ? ('user:' + username + ':') : '';

    db.zrevrange(
        userPrefix + 'group:' + group + ':urls', 0, 1000, 'withscores',
        function(err, urls){
            if (err){
                res.send(500);
            }
            else {
                var data = [];
                for (var i = 0; i < urls.length; i += 2){
                    var item = JSON.parse(urls[i]);
                    var date = new Date(parseFloat(urls[i + 1]));
                    data.push({
                        date: date.toUTCString(),
                        url: item.url,
                        username: item.username
                    });
                }
                res.render('view', {
                    group: group,
                    // If the public/js/client.js client needs to connect
                    // back to us using our port, use the next line and
                    // comment out the one after it.
                    // host: req.protocol + '://' + req.host + ':' + port,
                    host: req.protocol + '://' + req.host,
                    urls: data,
                    username: username,
                    title: 'my fab title'
                });
            }
        }
    );
});

app.get('/', function(req, res){
    res.render('home');
});

server.listen(port, '0.0.0.0');
console.log('Server running on port ' + port);
