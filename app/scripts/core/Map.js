define([
    'lodash',
    'backbone',
    'firebase',
    'phaser',
    'core/Utilities',
    'core/Storage',
    'core/Player',
    'core/Point'
], function (_, Backbone, Firebase, Phaser, Utilities, Storage, Player, Point) {
    'use strict';

    /**
     * @param {number} stage
     * @constructor
     */
    var Map = function (stage) {
        _.extend(this, Backbone.Events);
        this._id = Utilities.guid();

        this._path = '';
        this._stage = stage;

        this._points = {};
        this._pointsPhaser = undefined;

        this._players = {};
        this._playersPhaser = undefined;

        this._phaser = undefined;
        this._fb = undefined;

        this._worldPhaser = undefined;
    };

    /**
     * @param {string} path
     * @param {boolean} [silent=false]
     */
    Map.prototype.setPath = function (path, silent) {
        // 1. Aktualizujemy instancję.
        this._path = path;

        if (silent) return;

        // 2. Aktualizujemy pozycję w Firebase
        this._fb.update({
            path: this._path,
            stage: this._stage
        });
    };

    /**
     * @param {Point} point
     */
    Map.prototype.addPoint = function (point) {
        // console.log('Map#addPoint', point);
        // 1. Aktualizujemy instancję.
        this._points[point.getID()] = point;
        // 2. Dodajemy do grupy Phaser
        // 3. Ustawiamy połączenie Firebase
        point.setFirebaseConnection(this._fb.child('/points/' + point.getID()));
        // 4. Aktualizujemy pozycję w Firebase
        point.sync();
    };

    /**
     * @param {Point} point
     * @param {boolean} [silent=false]
     */
    Map.prototype.removePoint = function (point, silent) {
        // console.log('Map#removePoint', point, silent);
        // 1. Usuwamy obiekt
        try {
            point.destroy(silent);
        } catch (e) {
            console.log('Map#removePoint');
        }
        // 2. Usuwamy go z listy.
        delete this._points[point.getID()];
    };

    /**
     * @param {Function} cb
     */
    Map.prototype.loadChildren = function (cb) {
        var self = this;

        this._fb.once('value', function (snapshot) {
            var snap = snapshot.val();

            _.each(snap.players, function (remotePlayer, playerID) {
                var snapPlayer = snap.players[playerID];

                var playerInstance = new Player(snapPlayer.x, snapPlayer.y, snapPlayer.figure);
                playerInstance.setID(playerID);
                playerInstance.setName(snapPlayer.name);
                playerInstance.setScore(snapPlayer.score);

                self.addPlayer(playerInstance);
            });

            _.each(snap.points, function (remotePoint, pointID) {
                var snapPoints = snap.points[pointID];

                var point = new Point(snapPoints.x, snapPoints.y, snapPoints.value, snapPoints.figure);
                point.setID(pointID);

                self.addPoint(point);
            });

            if (_.isFunction(cb)) {
                cb();
            }
        });
    };

    /**
     * @param {Player} player
     */
    Map.prototype.addPlayer = function (player) {
        // console.log('Map#addPlayer', player);
        // 1. Aktualizujemy instancję.
        this._players[player.getID()] = player;
        // 2. Ustawiamy połączenie Firebase
        player.setFirebaseConnection(this._fb.child('/players/' + player.getID()));
        // 3. Aktualizujemy pozycję w Firebase
        player.sync();
    };

    /**
     * @param {Player} player
     */
    Map.prototype.removePlayer = function (player) {
        // console.log('Map#removePlayer', player);
        // 1. Usuwamy obiekt
        try {
            player.destroy();
        } catch (e) {
            console.log('Map#removePlayer');
        }
        // 2. Usuwamy go z listy.
        delete this._players[player.getID()];
        // 3. Usuwać z grupy Phasera
    };

    /**
     * @returns {string}
     */
    Map.prototype.getID = function () {
        return this._id;
    };

    Map.prototype.setID = function (id) {
        this._id = id;
    };

    /**
     * @returns {number}
     */
    Map.prototype.getStage = function () {
        return this._stage;
    };

    /**
     * @param {string} playerID
     * @returns {Player}
     */
    Map.prototype.getPlayerByID = function (playerID) {
        return this._players[playerID];
    };

    /**
     * @param {string} id
     * @returns {Point}
     */
    Map.prototype.getPointByID = function (id) {
        return _.findWhere(this._points, { _id: id });
    };

    /**
     * @param {Firebase} connection
     */
    Map.prototype.setFirebaseConnection = function (connection) {
        this._fb = connection;
    };

    Map.prototype.render = function (phaser) {
        // console.log('Map#render');
        // 1. Zbudować mapę za pomocą Phaser-a.
        this._phaser = phaser.add.tilemap('map-' + this._stage);
        this._phaser.addTilesetImage('tile-ground');

        // Add +1 to tile ID generated by Tiled program.
        this._phaser.setCollision([1, 2, 4]);

        this._worldPhaser = this._phaser.createLayer('Tile Layer 1');
        this._worldPhaser.resizeWorld();

        // 2. Tworzymy grupę player-ów
        this._playersPhaser = phaser.add.group();
        this._playersPhaser.enableBody = true;
        this._playersPhaser.physicsBodyType = Phaser.Physics.ARCADE;

        // 3. Renderujemy player-ów.
        _.invoke(this._players, 'render', phaser, this._playersPhaser);

        // 4. Kamera na graczu lokalnym.
        var localPlayerInstance = this.getPlayerByID(Storage.get(Player.STORAGE_KEY));
        localPlayerInstance.setCameraOnIt(phaser);

        // 5. Tworzymy grupę points-ów
        this._pointsPhaser = phaser.add.group();
        this._pointsPhaser.enableBody = true;
        this._pointsPhaser.physicsBodyType = Phaser.Physics.ARCADE;

        // 6. Renderujemy punkty-ów.
        _.invoke(this._points, 'render', phaser, this._pointsPhaser);
    };

    /**
     * @returns {Object}
     */
    Map.prototype.getPlayers = function () {
        return this._players;
    };

    return Map;
});
