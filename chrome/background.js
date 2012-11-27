var TC = {
    init: function(){
        var shared = {},
            endpointManager = this.EndpointManager(shared);

        this.TabManager(shared).init();

        endpointManager.addEndpoint({
            group: 'public',
            nickname: 'httpkit',
            url: 'http://echo.httpkit.com/'
        });

        endpointManager.addEndpoint({
            group: 'test',
            nickname: 'jon.es/test',
            password: 'password',
            url: 'http://jon.es:9999',
            username: 'username'
        });
    }
};

// ------------------------------ SOCKETS ------------------------------
(function(obj){
    obj.SocketManager = function(url, nickname, callback){
        var refCount = 0,
            savedSocket = null,  // Socket value saved if we're temporarily disconnected.
            socket = null;

        var get = function(){
            console.log('in socket get for ' + nickname);
            if (socket === null){
                var deferred = $.Deferred();
                console.log('socket was null: connecting to ' + url);
                try {
                    socket = io.connect(url, {
                        'force new connection': true
                    });
                }
                catch (e){
                    deferred.reject(e);
                    return deferred.promise();
                }
                socket.on('connect', function(){
                    if (socket){
                        savedSocket = socket;
                        console.log('socket connected for ' + nickname, socket);
                        if (callback){
                            socket.on('url', function(data){
                                console.log('received url data', data);
                                callback(data);
                            });
                        }
                        deferred.resolve(socket);
                    }
                    else if (savedSocket){
                        socket = savedSocket;
                        console.log('socket reconnected for ' + nickname);
                    }
                    else {
                        console.log('inconceivable socket weirdness occurred.');
                    }
                });
                socket.on('error', function(e){
                    console.log('got socket error for ' + nickname + ':', e);
                    socket = null;
                    // Assumption: we only reject the deferred once. If this
                    // proves false, set deferred = null after rejecting it
                    // and test it before rejecting.
                    deferred.reject(e);
                });
                socket.on('disconnect', function(){
                    console.log('socket disconnected for ' + nickname, socket);
                    socket = null;
                });
                return deferred.promise();
            }
            else {
                console.log('socket already existed.');
                return socket;
            }
        };

        var use = function(){
            refCount++;
        };

        var release = function(){
            refCount--;
            console.log('in socket release, refcount is now ' + refCount);
            if (refCount === 0){
                socket.disconnect();
                socket = null;
            }
            else if (refCount < 0){
                console.log('Reference count (' + refCount +
                            ') incorrect in socketManager release method.');
            }
        };

        return {
            get: get,
            release: release,
            use: use
        };
    };
})(TC);


// ------------------------------ ENDPOINTS ------------------------------
(function(obj){
    obj.EndpointManager = function(shared){
        var endpoints = {};
        shared.endpoints = endpoints;

        var addEndpoint = function(options){
            var nickname = options.nickname,
                url = options.url;

            // Endpoint URLs must end in a slash.
            url += (options.url.charAt(options.url.length - 1) === '/' ?
                    '' : '/');

            var contextMenuId = chrome.contextMenus.create({
                checked: false,
                title: 'Broadcast to ' + nickname,
                contexts: ['all'],
                type: 'checkbox',
                onclick : function(info, tab){
                    shared.contextMenuClick(nickname, info, tab);
                }
            });

            endpoints[nickname] = {
                broadcastSocket: obj.SocketManager(url, nickname),
                contextMenuId: contextMenuId,
                group: options.group,
                trackSocket: obj.SocketManager(url, nickname, function(data){
                    shared.urlReceived(nickname, data);
                }),
                url: url,
                username: options.username,
                password: options.password
            };

            shared.endpointAdded(nickname);
        };

        var removeEndpoint = function(nickname){
            shared.endpointRemoved(nickname);
            chrome.contextMenus.remove(endpoints[nickname].contextMenuId);
            delete endpoints[nickname];
        };

        return {
            addEndpoint: addEndpoint,
            removeEndpoint: removeEndpoint
        };
    };
})(TC);


// ------------------------------ TABS ------------------------------
(function(obj){
    obj.TabManager = function(shared){
        var tabs = {},
            broadcastBadgeBackgroundColor = '#F00',
            trackBadgeBackgroundColor = '#0F0',
            trackBadgeText = 'auto';

        var init = function(){
            chrome.tabs.onCreated.addListener(function(tab){
                // Note that chrome.tabs.onUpdated is not called for
                // newly created tabs.
                console.log('tab ' + tab.id + ' created for url ' + tab.url);
                var broadcast = {};
                for (var nickname in shared.endpoints){
                    broadcast[nickname] = false;
                };
                tabs[tab.id] = {
                    broadcast: broadcast,
                    tracking: null,
                    url: tab.url
                };
                var tracking = checkIfTabIsOpeningAnEndpoint(tab);
                if (tracking){
                    $.when(
                        track(tab.id, tracking.nickname, tracking.group)
                    ).always(function(){
                        updateBadge(tab.id);
                    });
                }
            });

            // When a tab is removed, it must release any tracking or
            // broadcasting sockets it has in use.
            chrome.tabs.onRemoved.addListener(function(tabId){
                console.log('tab removed');
                var nickname;
                if (tabs[tabId].tracking){
                    nickname = tabs[tabId].tracking.nickname;
                    shared.endpoints[nickname].trackSocket.release();
                    shared.endpoints[nickname].broadcastSocket.release();
                }
                else {
                    var broadcast = tabs[tabId].broadcast;
                    for (nickname in shared.endpoints){
                        if (broadcast[nickname]){
                            shared.endpoints[nickname]
                                .broadcastSocket.release();
                        }
                    };
                }
                delete tabs[tabId];
            });

            // When a tab loads a URL, check to see if it's visiting one of
            // our endpoints. If not, broadcast the URL to the endpoints
            // that are active for the tab.

            chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab){
                if (changeInfo.status === 'loading'){
                    tabs[tabId].url = tab.url;
                    console.log('tab ' + tabId + ' updated (' + changeInfo.status + ') to url ' + tab.url);
                    if (tabs[tabId].tracking){
                        console.log('already tracking');
                        // This tab is tracking an endpoint.
                        if (tab.url !== tabs[tabId].tracking.url){
                            console.log('local user goes to new URL in tracking tab');
                            broadcast(tab, tabs[tabId].tracking.nickname);
                        }
                        updateBadge(tabId);
                    }
                    else {
                        var tracking = checkIfTabIsOpeningAnEndpoint(tab);
                        if (tracking){
                            // This tab is about to track an endpoint, so
                            // we must disable any broadcasting it is doing (other
                            // than to the endpoint we're about to track).
                            for (var nickname in shared.endpoints){
                                if (tabs[tabId].broadcast[nickname] &&
                                    nickname !== tracking.nickname){
                                    shared.endpoints[nickname].broadcastSocket
                                        .release();
                                    tabs[tabId].broadcast[nickname] = false;
                                }
                            }
                            $.when(
                                track(tabId, tracking.nickname, tracking.group)
                            ).always(function(){
                                updateBadge(tabId);
                            });
                        }
                        else {
                            // No tracking involved, broadcast to any
                            // relevant endpoints.
                            var deferreds = [];
                            for (nickname in shared.endpoints){
                                if (tabs[tab.id].broadcast[nickname]){
                                    deferreds.push(broadcast(tab, nickname));
                                }
                            }
                            $.when(deferreds).always(function(){
                                updateBadge(tabId);
                            });
                        }
                    }
                }
            });

            // When a tab becomes active, update the context menu so it shows
            // its broadcast status for each of the endpoints.
            chrome.tabs.onActivated.addListener(function(activeInfo){
                var nickname;
                if (tabs[activeInfo.tabId].tracking){
                    // An endpoint is being tracked, so all broadcast
                    // context menu items should be shown as disabled.
                    for (nickname in shared.endpoints){
                        chrome.contextMenus.update(
                            shared.endpoints[nickname].contextMenuId, {
                                checked: false,
                                enabled: false
                            });
                    }
                }
                else {
                    var broadcast = tabs[activeInfo.tabId].broadcast;
                    for (nickname in shared.endpoints){
                        chrome.contextMenus.update(
                            shared.endpoints[nickname].contextMenuId, {
                                checked: broadcast[nickname],
                                enabled: true
                            });
                    }
                }
                updateBadge(activeInfo.tabId);
            });

            // Set all existing tabs to have a false broadcast value for
            // all known endpoints, and a null tracking value.
            chrome.tabs.query({}, function(existingTabs){
                for (var i = 0; i < existingTabs.length; i++){
                    var broadcast = {};
                    for (var nickname in shared.endpoints){
                        broadcast[nickname] = false;
                    }
                    tabs[existingTabs[i].id] = {
                        broadcast: broadcast,
                        tracking: null,
                        url: existingTabs[i].url
                    };
                    updateBadge(existingTabs[i].id);
                }
            });
        };

        var broadcast = function(tab, nickname){
            // Send the URL being opened by a tab to the endpoint with nickname.
            return $.when(
                shared.endpoints[nickname].broadcastSocket.get()
            ).then(
                function(socket){
                    console.log('tab ' + tab.id + ' tries to broadcast ' + tab.url + ' to ' + nickname);
                    var endpoint = shared.endpoints[nickname];
                    try {
                        socket.emit('url', {
                            group: endpoint.group,
                            password: endpoint.password,
                            url: tab.url,
                            username: endpoint.username
                        });
                    }
                    catch (e){
                        console.log('Error broadcasting to ' + nickname + '. ' +
                                    e.name + ': ' + e.message);
                        return;
                    }
                    console.log('broadcast of ' + tab.url + ' to ' + nickname +
                                ' done.');
                },
                function(error){
                    console.log('tab ' + tab.id + ' broadcast ' + tab.url +
                                ' to ' + nickname + ' failed.');
                    if (error){
                        console.log(error.name + ': ' + error.message);
                    }
                }
            );
        };

        var checkIfTabIsOpeningAnEndpoint = function(tab){
            // Figure out if a tab is opening a URL at one of our
            // endpoints.  If so, return the endpoint's nickname and the
            // name of the group being accessed.
            for (var nickname in shared.endpoints){
                var trackPrefix = shared.endpoints[nickname].url + 'track/';
                if (tab.url.indexOf(trackPrefix) === 0){
                    return {
                        group: tab.url.substr(trackPrefix.length),
                        nickname: nickname
                    };
                }
            }
            return null;
        };

        var track = function(tabId, nickname, group){
            // Set the passed tab up to track a group on an endpoint.
            var tab = tabs[tabId];
            console.log('Tab visits tracking endpoint ' + nickname);
            return $.when(
                shared.endpoints[nickname].trackSocket.get()
            ).then(
                function(socket){
                    try {
                        socket.emit('track', group);
                    }
                    catch (e){
                        console.log('Could not send track command to ' +
                                    nickname + ' server.' + '. ' +
                                    e.name + ': ' + e.message);
                        return;
                    }
                    shared.endpoints[nickname].trackSocket.use();
                    tab.tracking = {
                        group: group,
                        nickname: nickname,
                        url: shared.endpoints[nickname].url + 'track/' + group
                    };
                    // Set the tab up to broadcast to the endpoint it is now
                    // tracking (if it's not doing that already).
                    if (!tabs[tabId].broadcast[nickname]){
                        tabs[tabId].broadcast[nickname] = true;
                        shared.endpoints[nickname].trackSocket.use();
                    }
                    console.log('Now tracking endpoint ' + nickname);
                },
                function(error){
                    console.log('Could not get socket to track endpoint ' +
                                nickname + '. ');
                    if (error){
                        console.log(error.name + ': ' + error.message);
                    }
                }
            );
        };

        var updateBadge = function(tabId){
            if (tabs[tabId].tracking){
                chrome.browserAction.setBadgeBackgroundColor({
                    color: trackBadgeBackgroundColor,
                    tabId: tabId
                });
                chrome.browserAction.setBadgeText({
                    tabId: tabId,
                    text: trackBadgeText
                });
            }
            else {
                var broadcastCount = 0,
                    broadcast = tabs[tabId].broadcast;
                for (var nickname in shared.endpoints){
                    if (broadcast[nickname]){
                        broadcastCount++;
                    }
                }
                chrome.browserAction.setBadgeBackgroundColor({
                    color: broadcastBadgeBackgroundColor,
                    tabId: tabId
                });
                chrome.browserAction.setBadgeText({
                    tabId: tabId,
                    text: broadcastCount ? '' + broadcastCount : ''
                });
            }
        };

        shared.contextMenuClick = function(nickname, info, tab){
            if (info.checked){
                tabs[tab.id].broadcast[nickname] = true;
                shared.endpoints[nickname].broadcastSocket.use();
                // Broadcast the current URL off immediately.
                $.when(
                    broadcast(tab, nickname)
                ).always(function(){
                    updateBadge(tab.id);
                });
            }
            else {
                tabs[tab.id].broadcastSocket[nickname] = false;
                shared.endpoints[nickname].broadcastSocket.release();
                updateBadge(tab.id);
            }
        };

        shared.endpointAdded = function(nickname){
            for (var tabId in tabs){
                tabs[tabId].broadcast[nickname] = false;
            };
        };

        shared.endpointRemoved = function(nickname){
            for (var tabId in tabs){
                var tab = tabs[tabId];
                if (tab.tracking){
                    if (tab.tracking.nickname === nickname){
                        shared.endpoints[nickname].trackSocket.release();
                        shared.endpoints[nickname].broadcastSocket.release();
                        tab.tracking = null;
                    }
                }
                else if (tab.broadcast[nickname]){
                    shared.endpoints[nickname].broadcastSocket.release();
                }
                delete tab.broadcast[nickname];
                updateBadge(tabId);
            }
        };

        shared.urlReceived = function(nickname, data){
            console.log('URL received ' + nickname, data);
            for (var tabId in tabs){
                var tracking = tabs[tabId].tracking;
                console.log('Tracking is', tracking);
                if (tracking && tracking.nickname === nickname &&
                    tracking.group === data.group){
                    console.log('Tracking tab received data for nickname ' +
                                nickname, data, tabId);
                    // Only update a tracking tab if it's not already at the
                    // desired URL.   This is not perfect - what if someone
                    // else is driving the session and they deliberately do
                    // a reload?  Would be better to base this on username,
                    // if we have one and tabid.
                    if (tabs[tabId].url !== data.url){
                        tracking.url = data.url;
                        chrome.tabs.update(parseInt(tabId, 10), {
                            url: data.url
                        });
                    }
                    else {
                        console.log('tracking tag is already looking at ' + data.url);
                    };
                }
                else {
                    if (tracking){
                        console.log('tab received non-matching data for nickname ' + nickname, data, tracking);
                    }
                }
            }
        };

        return {
            init: init
        };
    };
})(TC);

TC.init();
