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
            if (socket === null){
                var deferred = $.Deferred();
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
                    console.log('socket connected to ' + nickname);
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
                    console.log('socket disconnected from ' + nickname);
                    socket = null;
                });
                socket.on('authentication failed', function(data){
                    console.log('socket authentication failure', data);
                });
                return deferred.promise();
            }
            else {
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

            viewHistoryMenuItem = chrome.contextMenus.create({
                title: 'See URL history for',
                contexts: ['all']
            });

            broadcastMenuItem = chrome.contextMenus.create({
                title: "Send all URLs from this tab to",
                contexts: ['all']
            });

            sendMenuItem = chrome.contextMenus.create({
                title: 'Send the current URL to',
                contexts: ['all']
            });

            trackMenuItem = chrome.contextMenus.create({
                title: 'Synchronize this tab with',
                contexts: ['all']
            });
        };

        var addContextSubmenus = function(nickname){
            var endpoint = endpoints[nickname];

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

            endpoint.broadcastContextMenuId = broadcastContextMenuId;
            endpoint.sendContextMenuId = sendContextMenuId;
            endpoint.trackContextMenuId = trackContextMenuId;
            endpoint.viewHistoryContextMenuId = viewHistoryContextMenuId;
        };

        var removeContextSubmenus = function(nickname){
            var endpoint = endpoints[nickname];
            chrome.contextMenus.remove(endpoint.broadcastContextMenuId);
            chrome.contextMenus.remove(endpoint.sendContextMenuId);
            chrome.contextMenus.remove(endpoint.trackContextMenuId);
            chrome.contextMenus.remove(endpoint.viewHistoryContextMenuId);
        };

        var addEndpoint = function(options, save){
            var nickname = options.nickname,
                url = options.url,
                existingNickname;

            // Endpoint URLs must end in a slash.
            url += (options.url.charAt(options.url.length - 1) === '/' ?
                    '' : '/');

            // Remove all the context menu subitems as we want the new
            // endpoint nickname to appear in sorted order (we could do
            // some trivial optimizations here at the cost of code
            // simplicity - if there are no endpoints or if the new one
            // would be at the end).
            for (existingNickname in endpoints){
                removeContextSubmenus(existingNickname);
            }

            endpoints[nickname] = {
                broadcastSocket: obj.SocketManager(url, nickname),
                group: options.group,
                password: options.password,
                trackSocket: obj.SocketManager(url, nickname, function(data){
                    shared.urlReceived(nickname, data);
                }),
                url: url,
                username: options.username
            };

            // Add all context submenus, in sorted order.
            var nicknames = [];
            for (existingNickname in endpoints){
                nicknames.push(existingNickname);
            }
            nicknames.sort();
            for (var i = 0; i < nicknames.length; i++){
                addContextSubmenus(nicknames[i]);
            }

            if (save){
                saveEndpoints();
            }

            shared.endpointAdded(nickname);
        };

        var removeEndpoint = function(nickname){
            shared.endpointRemoved(nickname);
            removeContextSubmenus(nickname);
            delete endpoints[nickname];
            saveEndpoints();
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
            if (chrome.storage){
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
                        else {
                            console.log('Saved endpoints.');
                        }
                    }
                );
            }
            else {
                localStorage.tabcastEndpoints = JSON.stringify({
                    endpoints: value,
                    storageFormat: storageFormat
                });
            }
        };

        var restoreSavedEndpoints = function(){
            var defaultEndpoints = {
                endpoints: [
                    {
                        group: 'public',
                        nickname: 'public',
                        url: 'http://tabcast.net'
                    }
                ],
                storageFormat: storageFormat
            };

            var restore = function(settings){
                console.log('Loaded stored endpoints.');
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
            };

            if (chrome.storage){
                chrome.storage.sync.get(
                    {
                        tabcastEndpoints: defaultEndpoints
                    },
                    function(settings){
                        if (chrome.runtime.lastError){
                            alert('Could not retrieve saved settings! ' +
                                  chrome.runtime.lastError.message);
                        }
                        else {
                            restore(settings);
                        }
                    }
                );
            }
            else {
                 restore(
                     JSON.parse(
                         localStorage.tabcastEndpoints || defaultEndpoints
                     )
                 );
            }
        };

        // Unused.
        var clearSavedEndpoints = function(){
            var empty = {
                tabcastEndpoints: {
                    endpoints: [],
                    storageFormat: storageFormat
                }
            };
            if (chrome.storage){
                chrome.storage.sync.set(empty);
            }
            else {
                localStorage.tabcastEndpoints = JSON.stringify(empty);
            }
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
            badgeTrackingBackgroundColor = '#0F0',
            badgeBroadcastingBackgroundColor = '#F00',
            // Despite Chrome docs, badge text should only be 3 chars, due
            // to problem on Linux.
            badgeTrackingText = ' S ';  // S = synchronized.

        var init = function(){
            chrome.tabs.onCreated.addListener(function(tab){
                // Note that chrome.tabs.onUpdated is not called for
                // newly created tabs.
                var broadcast = {};
                for (var nickname in shared.endpoints){
                    broadcast[nickname] = false;
                }
                tabs[tab.id] = {
                    broadcast: broadcast,
                    tracking: null,
                    url: tab.url
                };
                var trackingNickname = isTrackingUrl(tab);
                if (trackingNickname){
                    $.when(
                        track(tab.id, trackingNickname)
                    ).always(function(){
                        if (tab.active){
                            updateContextMenu(tab.id);
                        }
                        updateBadge(tab.id);
                    });
                }
            });

            // When a tab is removed, it must release any tracking or
            // broadcasting sockets it has in use.
            chrome.tabs.onRemoved.addListener(function(tabId){
                var nickname;
                if (tabs[tabId].tracking){
                    untrack(tabId);
                }
                else {
                    var broadcast = tabs[tabId].broadcast;
                    for (nickname in shared.endpoints){
                        if (broadcast[nickname]){
                            shared.endpoints[nickname]
                                .broadcastSocket.release();
                        }
                    }
                }
                delete tabs[tabId];
            });

            // When a tab loads a URL:
            //
            // If it's tracking a group: check to see if it's loading a URL
            // the group has been told to load or if the user has clicked
            // on a link, in which case we send the new URL to the group.
            //
            // If it's not tracking: send the URL to the broadcast
            // endpoints that are active for the tab.

            chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab){
                if (changeInfo.status !== 'loading'){
                    return;
                }
                // Remember the URL the tab is now at.
                tabs[tabId].url = tab.url;

                if (tabs[tabId].tracking){
                    // This tab is tracking an endpoint.
                    if (tab.url !== tabs[tabId].tracking.url){
                        // The tab has not just loaded a URL we sent it to.
                        // Instead, the user has clicked a link or changed the
                        // URL in the address bar. Send the new URL to the
                        // group.
                        broadcast(tab, tabs[tabId].tracking.nickname);
                    }
                    updateBadge(tabId);
                }
                else {
                    var trackingNickname = isTrackingUrl(tab),
                        nickname;
                    if (trackingNickname){
                        // This tab is about to track an endpoint, so we
                        // must disable any broadcasting it was doing
                        // (other than to the endpoint we're now tracking).
                        for (nickname in shared.endpoints){
                            if (tabs[tabId].broadcast[nickname] &&
                                nickname !== trackingNickname){
                                shared.endpoints[nickname].broadcastSocket
                                    .release();
                                tabs[tabId].broadcast[nickname] = false;
                            }
                        }
                        $.when(
                            track(tabId, trackingNickname)
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

                if (tab.active){
                    updateContextMenu(tabId);
                }
            });

            // When a tab becomes active, update the context menu so it shows
            // its broadcast status for each of the endpoints.
            chrome.tabs.onActivated.addListener(function(activeInfo){
                updateContextMenu(activeInfo.tabId);
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

        var updateContextMenu = function(tabId){
            var nickname;
            if (tabs[tabId].tracking){
                // An endpoint is being tracked. All broadcast context
                // menu items should be shown as disabled.
                var tracking = tabs[tabId].tracking;
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
                // Not tracking.
                var broadcast = tabs[tabId].broadcast;
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
        };

        var broadcast = function(tab, nickname){
            // Send the URL being opened by a tab to the endpoint with nickname.
            return $.when(
                shared.endpoints[nickname].broadcastSocket.get()
            ).then(
                function(socket){
                    console.log('broadcast ' + tab.url + ' to ' + nickname);
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

        var isTrackingUrl = function(tab){
            // Figure out if a tab is opening a tracking URL at one of our
            // endpoints.  If so, return the endpoint's nickname.
            for (var nickname in shared.endpoints){
                var endpoint = shared.endpoints[nickname];
                var url = endpoint.url + 'track/' + endpoint.group;
                if (tab.url === url){
                    return nickname;
                }
            }
            return null;
        };

        var track = function(tabId, nickname){
            // Set the passed tab up to track a group on an endpoint.
            var tab = tabs[tabId];
            return $.when(
                shared.endpoints[nickname].trackSocket.get()
            ).then(
                function(socket){
                    var group = shared.endpoints[nickname].group;
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
                    console.log('Now tracking ' + nickname);
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

        var untrack = function(tabId){
            var tab = tabs[tabId],
                tracking = tab.tracking,
                nickname = tracking.nickname;
            shared.endpoints[nickname].trackSocket.release();
            shared.endpoints[nickname].broadcastSocket.release();
            tab.tracking = null;
            tab.broadcast[nickname] = false;
        };

        var updateBadge = function(tabId){
            if (tabs[tabId].tracking){
                chrome.browserAction.setBadgeBackgroundColor({
                    color: badgeTrackingBackgroundColor,
                    tabId: tabId
                });
                chrome.browserAction.setBadgeText({
                    tabId: tabId,
                    text: badgeTrackingText
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
                    color: badgeBroadcastingBackgroundColor,
                    tabId: tabId
                });
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
            var tabId = tab.id;
            // If this tab was tracking anything, stop the tracking. The
            // user has either turned off tracking or turned it on on some
            // other endpoint. In either case we stop any current tracking.
            if (tabs[tabId].tracking){
                untrack(tabId);
                updateContextMenu(tabId);
                updateBadge(tabId);
            }
            if (info.checked){
                var endpoint = shared.endpoints[nickname];
                // Start tracking the endpoint by sending the tab to the
                // endpoint's track URL.
                chrome.tabs.update(tabId, {
                    url: endpoint.url + 'track/' + endpoint.group
                });
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
            }
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
            var updateBadgeForTab = function(tab){
                updateBadge(tab.id);
            };
            for (var tabId in tabs){
                var tracking = tabs[tabId].tracking;
                if (tracking &&
                    tracking.nickname === nickname &&
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
                            updateBadgeForTab
                        );
                    }
                    else {
                        console.log('Tracking tab already open on url ' +
                                    data.url);
                    }
                }
                else {
                    if (tracking){
                        console.log('Tracking tab nickname/group do not ' +
                                    'match incoming url');
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
