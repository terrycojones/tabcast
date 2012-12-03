var TC = {
    init: function(){
        var shared = {};
        this.endpointManager = this.EndpointManager(shared);
        this.endpointManager.init();
        this.TabManager(shared).init();
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
                        if (callback){
                            socket.on('url', function(data){
                                callback(data);
                            });
                        }
                        deferred.resolve(socket);
                    }
                    else if (savedSocket){
                        socket = savedSocket;
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
                    console.log('socket disconnected for ' + nickname);
                    socket = null;
                });
                socket.on('authentication failed', function(data){
                    console.log('socket authentication failure', data);
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
            if (refCount === 0){
                if (socket){
                    // socket may still be 'null' even though .use has been called.
                    // .use only indicates an intention to use the socket.
                    socket.disconnect();
                    socket = null;
                }
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
        var endpoints = {},
            broadcastMenuItem,
            sendMenuItem,
            storageFormat = 1,
            trackMenuItem,
            viewHistoryMenuItem;

        var init = function(){
            shared.endpoints = endpoints;
            // Reset the saved endpoints if you completely mess up the locally
            // stored endpoints or change their format, etc.
            // clearSavedEndpoints();
            restoreSavedEndpoints();

            broadcastMenuItem = chrome.contextMenus.create({
                title: 'Broadcast all URLs to',
                contexts: ['all']
            });

            sendMenuItem = chrome.contextMenus.create({
                title: 'Send current URL to',
                contexts: ['all']
            });

            trackMenuItem = chrome.contextMenus.create({
                title: 'Track group',
                contexts: ['all']
            });

            viewHistoryMenuItem = chrome.contextMenus.create({
                title: 'View URL history',
                contexts: ['all']
            });
        };

        var addEndpoint = function(options, save){
            var nickname = options.nickname,
                url = options.url;

            // Endpoint URLs must end in a slash.
            url += (options.url.charAt(options.url.length - 1) === '/' ?
                    '' : '/');

            var broadcastContextMenuId = chrome.contextMenus.create({
                checked: false,
                contexts: ['all'],
                parentId: broadcastMenuItem,
                title: nickname,
                type: 'checkbox',
                onclick : function(info, tab){
                    shared.broadcastMenuClick(nickname, info, tab);
                }
            });

            var sendContextMenuId = chrome.contextMenus.create({
                contexts: ['all'],
                parentId: sendMenuItem,
                title: nickname,
                onclick : function(info, tab){
                    shared.sendMenuClick(nickname, tab);
                }
            });

            var trackContextMenuId = chrome.contextMenus.create({
                checked: false,
                contexts: ['all'],
                parentId: trackMenuItem,
                title: nickname,
                type: 'checkbox',
                onclick : function(info, tab){
                    shared.trackMenuClick(nickname, info, tab);
                }
            });

            var viewHistoryContextMenuId = chrome.contextMenus.create({
                contexts: ['all'],
                parentId: viewHistoryMenuItem,
                title: nickname,
                onclick : function(info, tab){
                    shared.viewHistoryMenuClick(nickname, tab);
                }
            });

            endpoints[nickname] = {
                broadcastSocket: obj.SocketManager(url, nickname),
                broadcastContextMenuId: broadcastContextMenuId,
                group: options.group,
                sendContextMenuId: sendContextMenuId,
                trackContextMenuId: trackContextMenuId,
                trackSocket: obj.SocketManager(url, nickname, function(data){
                    shared.urlReceived(nickname, data);
                }),
                url: url,
                username: options.username,
                password: options.password
            };

            if (save){
                saveEndpoints();
            }

            shared.endpointAdded(nickname);
        };

        var removeEndpoint = function(nickname){
            shared.endpointRemoved(nickname);
            chrome.contextMenus.remove(endpoints[nickname].broadcastContextMenuId);
            chrome.contextMenus.remove(endpoints[nickname].sendContextMenuId);
            chrome.contextMenus.remove(endpoints[nickname].trackContextMenuId);
            delete endpoints[nickname];
        };

        var endpointsForOptions = function(){
            // Return endpoints for options.js.
            var result = {};
            for (var nickname in endpoints){
                var endpoint = endpoints[nickname];
                result[nickname] = {
                    group: endpoint.group,
                    nickname: nickname,
                    password: endpoint.password,
                    url: endpoint.url,
                    username: endpoint.username
                };
            }
            return result;
        };

        var saveEndpoints = function(){
            var value = [];
            for (var nickname in endpoints){
                var endpoint = endpoints[nickname];
                value.push({
                    group: endpoint.group,
                    nickname: nickname,
                    password: endpoint.password,
                    url: endpoint.url,
                    username: endpoint.username
                });
            }
            chrome.storage.sync.set(
                {
                    tabcastEndpoints: {
                        endpoints: value,
                        storageFormat: storageFormat
                    }
                },
                function(){
                    if (chrome.runtime.lastError){
                        alert('Could not save settings! ' +
                              chrome.runtime.lastError.message);
                    }
                }
            );
        };

        var restoreSavedEndpoints = function(){
            chrome.storage.sync.get(
                {
                    tabcastEndpoints: {
                        endpoints: [
                            {
                                group: 'test',
                                nickname: 'localhost-test',
                                url: 'http://localhost:9999'
                            }
                        ],
                        storageFormat: storageFormat
                    }
                },
                function(settings){
                    if (chrome.runtime.lastError){
                        alert('Could not retrieve saved settings! ' +
                              chrome.runtime.lastError.message);
                    }
                    else {
                        console.log('Loaded stored settings', settings);
                        if (settings.tabcastEndpoints.storageFormat === 1){
                            var saved = settings.tabcastEndpoints.endpoints;
                            for (var i = 0; i < saved.length; i++){
                                addEndpoint(saved[i], false);
                            }
                        }
                        else {
                            console.log(
                                'Unknown endpoint storage format (' +
                                settings.tabcastEndpoints.storageFormat +
                                ').');
                        }
                    }
                }
            );
        };

        // Unused.
        var clearSavedEndpoints = function(){
            chrome.storage.sync.set({
                tabcastEndpoints: {
                    endpoints: [],
                    storageFormat: storageFormat
                }
            });
        };

        return {
            addEndpoint: addEndpoint,
            endpointsForOptions: endpointsForOptions,
            init: init,
            removeEndpoint: removeEndpoint
        };
    };
})(TC);


// ------------------------------ TABS ------------------------------
(function(obj){
    obj.TabManager = function(shared){
        var tabs = {},
            badgeBackgroundColor = '#0F0',
            trackBadgeText = 'auto';

        var init = function(){
            chrome.browserAction.setBadgeBackgroundColor({
                color: badgeBackgroundColor
            });

            chrome.tabs.onCreated.addListener(function(tab){
                // Note that chrome.tabs.onUpdated is not called for
                // newly created tabs.
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
                    if (tabs[tabId].tracking){
                        // This tab is tracking an endpoint.
                        if (tab.url !== tabs[tabId].tracking.url){
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
                    var tracking = tabs[activeInfo.tabId].tracking;
                    for (nickname in shared.endpoints){
                        chrome.contextMenus.update(
                            shared.endpoints[nickname].trackContextMenuId, {
                                checked: nickname === tracking.nickname,
                                enabled: true,
                                type: 'checkbox' // Needed for apparent Chrome bug.
                            });
                        // Don't let the user turn off broadcasting if they're
                        // tracking.  Maybe we can make this more flexible
                        // later.
                        chrome.contextMenus.update(
                            shared.endpoints[nickname].broadcastContextMenuId, {
                                checked: nickname === tracking.nickname,
                                enabled: false,
                                type: 'checkbox' // Needed for apparent Chrome bug.
                            });
                    }
                }
                else {
                    var broadcast = tabs[activeInfo.tabId].broadcast;
                    for (nickname in shared.endpoints){
                        chrome.contextMenus.update(
                            shared.endpoints[nickname].trackContextMenuId, {
                                checked: false,
                                enabled: true,
                                type: 'checkbox' // Needed for apparent Chrome bug.
                            });
                        chrome.contextMenus.update(
                            shared.endpoints[nickname].broadcastContextMenuId, {
                                checked: broadcast[nickname],
                                enabled: true,
                                type: 'checkbox' // Needed for apparent Chrome bug.
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
            return $.when(
                shared.endpoints[nickname].trackSocket.get()
            ).then(
                function(socket){
                    try {
                        socket.emit('track', group);
                        // Request the last url for the group, if any.
                        socket.emit('last url', group);
                    }
                    catch (e){
                        console.log('Could not send initial track commands ' +
                                    'to ' + nickname + ' server.' + '. ' +
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
                        shared.endpoints[nickname].broadcastSocket.use();
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
            // console.log('in updateBadge tabId=' + tabId, tabs[tabId]);
            if (tabs[tabId].tracking){
                // console.log('in updateBadge, we are tracking');
                chrome.browserAction.setBadgeText({
                    tabId: tabId,
                    text: trackBadgeText
                });
            }
            else {
                // console.log('in updateBadge, we are NOT tracking');
                var broadcastCount = 0,
                    broadcast = tabs[tabId].broadcast;
                for (var nickname in shared.endpoints){
                    if (broadcast[nickname]){
                        broadcastCount++;
                    }
                }
                chrome.browserAction.setBadgeText({
                    tabId: tabId,
                    text: broadcastCount ? '' + broadcastCount : ''
                });
            }
        };

        shared.broadcastMenuClick = function(nickname, info, tab){
            if (info.checked){
                tabs[tab.id].broadcast[nickname] = true;
                shared.endpoints[nickname].broadcastSocket.use();
                // Broadcast the current URL immediately.
                $.when(
                    broadcast(tab, nickname)
                ).always(function(){
                    updateBadge(tab.id);
                });
            }
            else {
                tabs[tab.id].broadcast[nickname] = false;
                shared.endpoints[nickname].broadcastSocket.release();
                updateBadge(tab.id);
            }
        };

        shared.sendMenuClick = function(nickname, tab){
            // Context menu click in a tab. Send its URL to the group on
            // the endpoint nickname.
            $.when(
                shared.endpoints[nickname].broadcastSocket.get()
            ).then(
                function(socket){
                    try {
                        var endpoint = shared.endpoints[nickname];
                        socket.emit('url', {
                            group: endpoint.group,
                            password: endpoint.password,
                            url: tab.url,
                            username: endpoint.username
                        });
                    }
                    catch (e){
                        console.log('Could not send track command to ' +
                                    nickname + ' server.' + '. ' +
                                    e.name + ': ' + e.message);
                        return;
                    }
                },
                function(error){
                    console.log('Could not send URL to endpoint ' +
                                nickname + '. ');
                    if (error){
                        console.log(error.name + ': ' + error.message);
                    }
                }
            );
        },

        shared.trackMenuClick = function(nickname, info, tab){
            var endpoint = shared.endpoints[nickname];
            if (info.checked){
                // Start tracking the endpoint.
                chrome.tabs.update(tab.id, {
                    url: endpoint.url + 'track/' + endpoint.group
                });
            }
            else {
                // Stop tracking the endpoint.
                endpoint.trackSocket.release();
                tabs[tab.id].tracking = null;
                endpoint.broadcastSocket.release();
                tabs[tab.id].broadcast[nickname] = false;
                updateBadge(tab.id);
            }
        };

        shared.viewHistoryMenuClick = function(nickname, tab){
            var endpoint = shared.endpoints[nickname];
            chrome.tabs.update(tab.id, {
                url: endpoint.url + 'view/' + endpoint.group
            });
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
            }
        };

        shared.urlReceived = function(nickname, data){
            console.log('URL received for ' + nickname + '. url=' +
                        data.url + ' group=' + data.group);
            for (var tabId in tabs){
                var tracking = tabs[tabId].tracking;
                if (tracking && tracking.nickname === nickname &&
                    tracking.group === data.group){
                    // Only update a tracking tab if it's not already at the
                    // desired URL.   This is not perfect - what if someone
                    // else is driving the session and they deliberately do
                    // a reload?  Would be better to base this on username,
                    // if we have one and tabid.
                    if (tabs[tabId].url !== data.url){
                        tracking.url = data.url;
                        chrome.tabs.update(
                            parseInt(tabId, 10),
                            {
                                url: data.url
                            },
                            function(tab){
                                updateBadge(tab.id);
                            }
                        );
                    }
                    else {
                        console.log('tracking tag already open on url ' + data.url);
                    };
                }
                else {
                    if (tracking){
                        console.log('Tracking tab nickname/group do not match incoming url');
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
