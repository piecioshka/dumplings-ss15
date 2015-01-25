define([
    'lodash',
    'backbone',
    'promise',
    'phaser',
    'core/Configuration',
    'core/Map',
    'core/Player',
    'core/Storage'
], function (_, Backbone, promise, Phaser, Configuration, Map, Player, Storage) {
    'use strict';

    var Game = function () {
        _.extend(this, Backbone.Events);
        this._maps = {};
        this._selectedMapID = undefined;
        this._fb = undefined;
        this._phaser = new Phaser.Game(Configuration.WORLD_WIDTH, Configuration.WORLD_HEIGHT, Phaser.CANVAS, 'playground');
        this._phaser.state.add('Bootstrap', {
            preload: this.preload.bind(this),
            create: this.create.bind(this),
            update: this.update.bind(this)
        });

        this._phaserCursors = undefined;
        this._phaserJumpButton = undefined;

        console.info('Game was created at: %s', new Date());
    };

    /**
     * @param {Map} map
     */
    Game.prototype.addMap = function (map) {
        // console.log('Game#addMap', map);
        // 1. Aktualizujemy instancję.
        this._maps[map.getID()] = map;
        // 2. Ustawiamy połączenie Firebase
        map.setFirebaseConnection(this._fb.child(map.getID()));
    };

    Game.prototype.setupEvents = function () {
        var self = this;

        // Jeśli usunęliśmy dowolną mapę z gry, to restartujemy całą gre.
        this._fb.on('child_removed', function () {
            location.reload(true);
        });

        _.each(this._maps, function (map, mapID) {
            this._fb.child(mapID + '/points').on('child_removed', function (snapshot) {
                var snap = snapshot.val();
                var pointInstance = map.getPointByID(snap.id);
                map.removePoint(pointInstance, true);
            });

            // ---------------------------------------------------------------------------------------------------------

            this._fb.child(mapID + '/players').on('child_added', function (snapshot) {
                var snap = snapshot.val();
                var playerInstance = map.getPlayerByID(snap.id);

                if (!playerInstance) {
                    playerInstance = new Player(snap.x, snap.y);
                    playerInstance.setID(snap.id);
                    playerInstance.render(self._phaser, map._playersPhaser);
                    map.addPlayer(playerInstance);
                }
            });

            this._fb.child(mapID + '/players').on('child_removed', function (snapshot) {
                var snap = snapshot.val();
                var playerInstance = map.getPlayerByID(snap.id);
                map.removePlayer(playerInstance);
            });

            this._fb.child(mapID + '/players').on('child_changed', function (snapshot) {
                var snap = snapshot.val();
                var playerInstance = map.getPlayerByID(snap.id);
                if (playerInstance) {
                    playerInstance.setPosition(snap.x, snap.y, true);
                    playerInstance.setScore(snap.score);
                }
            });
        }, this);
    };

    /**
     * @param {Function} cb
     */
    Game.prototype.fetchMaps = function (cb) {
        var self = this;

        this._fb.once('value', function (snapshot) {
            var snap = snapshot.val();

            var callbacks = [];

            _.each(snap, function (remoteMap, mapID) {
                var p = new promise.Promise();
                var snapMap = snap[mapID];

                var map = new Map(snapMap.stage);
                map.setID(mapID);
                map.setPath(snapMap.path, true);

                self.addMap(map);

                map.loadChildren(function () {
                    p.done();
                });

                callbacks.push(p);
            });

            promise.join(callbacks).then(cb);
        });
    };

    /**
     * @param {number} stage
     */
    Game.prototype.selectMap = function (stage) {
        var cachedSelectedMapID = this._selectedMapID;

        delete this._selectedMapID;

        _.each(this._maps, function (mapInstance, mapID) {
            var map = this._maps[mapID];

            if (map.getStage() !== stage) {
                return;
            }

            this._selectedMapID = mapID;
        }, this);

        if (!this._selectedMapID) {
            throw new Error('Sorry, we could not load map with stage: ' + stage);
        }

        if (cachedSelectedMapID && cachedSelectedMapID !== this._selectedMapID) {
            var map = this._maps[this._selectedMapID];

            if (map) {
                var localPlayerInstance = map.getPlayerByID(Storage.get(Player.STORAGE_KEY));

                if (localPlayerInstance) {
                    map.removePlayer(localPlayerInstance);
                }
            }
        }
    };

    Game.prototype.removeMaps = function () {
        this._fb.remove(function (error) {
            if (error) {
                throw new Error('Synchronization failed');
            }
        });
    };

    Game.prototype.renderSelectedMap = function () {
        var map = this._maps[this._selectedMapID];
        var playerID = Storage.get(Player.STORAGE_KEY);
        var localPlayer = new Player(_.random(30, 90), 194);

        if (_.isEmpty(playerID)) {
            Storage.put(Player.STORAGE_KEY, localPlayer.getID());
        } else {
            localPlayer.setID(playerID);
        }

        map.addPlayer(localPlayer);
        map.render(this._phaser);
    };

    /**
     * @param {Firebase} connection
     */
    Game.prototype.setFirebaseConnection = function (connection) {
        this._fb = connection;
    };

    Game.prototype.preload = function () {
        // console.log('Game#preload');
        this._phaser.load.spritesheet('tile-ground', 'assets/images/tile-ground.png', 32, 32);
        this._phaser.load.image('tile-monkey', 'assets/images/tile-monkey.png');
        this._phaser.load.tilemap('map-1', 'assets/maps/map-1.json', null, Phaser.Tilemap.TILED_JSON);
        this._phaser.load.tilemap('map-2', 'assets/maps/map-2.json', null, Phaser.Tilemap.TILED_JSON);
    };

    Game.prototype.create = function () {
        // console.log('Game#create');
        this._phaser.physics.startSystem(Phaser.Physics.ARCADE);
        this._phaser.stage.backgroundColor = '#fff';

        this._phaserCursors = this._phaser.input.keyboard.createCursorKeys();
        this._phaserJumpButton = this._phaser.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);

        this.renderSelectedMap();
    };

    Game.prototype.update = function () {
        // console.log('Game#update');
        var map = this._maps[this._selectedMapID];
        var localPlayerInstance = map.getPlayerByID(Storage.get(Player.STORAGE_KEY));

        // Może ktoś wyczyścił storage?
        if (localPlayerInstance) {
            this.setupCollisions();
            localPlayerInstance.update(this._phaser, this._phaserCursors, this._phaserJumpButton);
        }
    };

    Game.prototype.setupCollisions = function () {
        // console.log('Game#setupCollisions');
        var map = this._maps[this._selectedMapID];
        var localPlayerInstance = map.getPlayerByID(Storage.get(Player.STORAGE_KEY));

        this._phaser.physics.arcade.collide(map._playersPhaser, map._worldPhaser);
        this._phaser.physics.arcade.overlap(map._playersPhaser, map._pointsPhaser, function (player, point) {
            var pointInstance = map.getPointByID(point.id);
            map.removePoint(pointInstance);

            if (player.id === localPlayerInstance.getID()) {
                localPlayerInstance.addCollectedPoints(pointInstance);
            }
        });

        // Żeby punkty trzymały sie ziemi.
        this._phaser.physics.arcade.collide(map._pointsPhaser, map._worldPhaser);
    };

    Game.prototype.start = function () {
        this._phaser.state.start('Bootstrap');
    };

    return Game;
});
