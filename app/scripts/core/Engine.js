define([
    'phaser',
    'core/App',
    'core/helpers/AssetsLoader'
], function (Phaser, App, AssetsLoader) {
    'use strict';

    var Engine = {
        cursors: undefined,
        map: undefined,
        raft: undefined,
        world: undefined,
        
        waterGroup: undefined,
        playerGroup: undefined,
        pointGroup: undefined,

        jumpTimer: 0,
        jumpButton: undefined,

        preload: function () {
            // console.warn('Engine#preload');
            App.game.phaser.load.spritesheet('tile-ground', AssetsLoader.IMAGES.GROUND, 32, 32);
            App.game.phaser.load.image('tile-monkey', AssetsLoader.IMAGES.MONKEY);
            App.game.phaser.load.tilemap('map-1', 'assets/maps/map-1.json', null, Phaser.Tilemap.TILED_JSON);
        },

        _setupMap: function () {
            Engine.map = App.game.phaser.add.tilemap('map-1');
            Engine.map.name = 'map';
            Engine.map.addTilesetImage('tile-ground');

            // Add +1 to tile ID generated by Tiled program.
            Engine.map.setCollision([1, 2, 4]);
        },

        _setupWorld: function () {
            Engine.world = Engine.map.createLayer('Tile Layer 1');
            Engine.world.resizeWorld();
        },

        _setupRaft: function () {
            Engine.raft = App.game.phaser.add.tileSprite(32 * 7, 32 * 9, 32, 32, 'tile-ground', 4);
            Engine.raft.name = 'raft';
            App.game.phaser.physics.enable(Engine.raft, Phaser.Physics.ARCADE);
            Engine.raft.body.velocity.x = 120;
        },

        _setupWater: function () {
            Engine.waterGroup = App.game.phaser.add.group();
            Engine.waterGroup.name = 'water';
            Engine.waterGroup.enableBody = true;
            Engine.waterGroup.physicsBodyType = Phaser.Physics.ARCADE;

            _.times(7, function (index) {
                var waterTile = App.game.phaser.add.tileSprite(32 * (index + 6), 32 * 9, 32, 32, 'tile-ground', 2);
                waterTile.name = 'drop';
                Engine.waterGroup.add(waterTile);
                waterTile.body.immovable = true;
                waterTile.body.setSize(32, 22, 0, 10);
            });
        },

        _setupPlayerGroup: function () {
            Engine.playerGroup = App.game.phaser.add.group();
            Engine.playerGroup.name = 'playerGroup';
            Engine.playerGroup.enableBody = true;
            Engine.playerGroup.physicsBodyType = Phaser.Physics.ARCADE;

            // Add local player as first player to group.
            Engine.playerGroup.add(App.game.localPlayer.phaser);
        },

        _setupPointGroup: function () {
            Engine.pointGroup = App.game.phaser.add.group();
            Engine.pointGroup.name = 'points';
            Engine.pointGroup.enableBody = true;
            Engine.pointGroup.physicsBodyType = Phaser.Physics.ARCADE;

            var tileSize = {
                width: 32,
                height: 32
            };

            var tileList = [
                { x: 4, y: 1 },
                { x: 8, y: 4 },
                { x: 19, y: 0 },
                { x: 15, y: 3 }
            ];

            // Add points.
            tileList.forEach(function (tile) {
                Engine.pointGroup.add(App.game.phaser.add.tileSprite(
                    (tileSize.width * tile.x),
                    (tileSize.height * tile.y),
                    tileSize.width,
                    tileSize.height,
                    'tile-ground',
                    3
                ));
            });
        },

        create: function () {
            // console.warn('Engine#create');
            App.game.phaser.physics.startSystem(Phaser.Physics.ARCADE);
            App.game.phaser.stage.backgroundColor = '#fff';

            Engine._setupMap();
            Engine._setupWorld();

            App.game._createPhaserPlayer(App.game.localPlayer);
            App.game.phaser.camera.follow(App.game.localPlayer.phaser);

            Engine.cursors = App.game.phaser.input.keyboard.createCursorKeys();
            Engine.jumpButton = App.game.phaser.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);

            Engine._setupWater();
            Engine._setupRaft();
            Engine._setupPlayerGroup();
            Engine._setupPointGroup();
        },

        update: function () {
            // console.warn('Engine#update');
            var localPlayer = App.game.localPlayer;

            // Is player alive?
            if (!localPlayer.phaser.alive) {
                return;
            }

            this._setCollisions();

            // How much different between localPlayer and ground.
            localPlayer.phaser.body.velocity.x = 0;

            if (Engine.cursors.left.isDown) {
                localPlayer.phaser.body.velocity.x = -150;
            } else if (Engine.cursors.right.isDown) {
                localPlayer.phaser.body.velocity.x = 150;
            }

            if (Engine.jumpButton.isDown && localPlayer.phaser.body.onFloor() && App.game.phaser.time.now > Engine.jumpTimer) {
                localPlayer.phaser.body.velocity.y = -300;
                Engine.jumpTimer = App.game.phaser.time.now - 10;
            }

            if (localPlayer.firebase.id) {
                App.game.updatePlayer(localPlayer);
            }
        },

        _setCollisions: function () {
            var localPlayer = App.game.localPlayer;

            // Is player alive?
            if (!localPlayer.phaser.alive) {
                return;
            }

            App.game.phaser.physics.arcade.overlap(Engine.playerGroup, Engine.pointGroup, function (sprite, tileSprite) {
                /*if (tileSprite.index === 4) {
                    Engine.map.removeTile(tileSprite.x, tileSprite.y);
                }*/
                tileSprite.destroy();
            }, null, this);

            App.game.phaser.physics.arcade.collide(Engine.playerGroup, Engine.world, function (sprite, tile) {
                if (tile.index === 4) {
                    Engine.map.removeTile(tile.x, tile.y);
                }
            }, null, this);

            App.game.phaser.physics.arcade.collide(Engine.playerGroup, Engine.raft, function (player, raft) {
                player.body.immovable = true;
                raft.body.velocity.y = player.body.velocity.y = 0;
            }, null, this);

            App.game.phaser.physics.arcade.overlap(Engine.playerGroup, Engine.waterGroup, function () {
                console.log('topisz się...');
            });

            var currentRaftVelocity = Engine.raft.body.velocity.x;
            App.game.phaser.physics.arcade.collide(Engine.raft, Engine.world, function (sprite, tile) {
                if (tile.index === 1) {
                    Engine.raft.body.velocity.x = (currentRaftVelocity > 0) ? -120 : 120;
                }
            }, null, this);
        },

        render: function () {
            // console.warn('Engine#render');

            // Show bounding-box of localPlayer.
            // App.game.phaser.debug.body(App.game.localPlayer.phaser);

            // Show technical info about localPlayer.
            // App.game.phaser.debug.bodyInfo(App.game.localPlayer.phaser, 16, 40);
        }
    };

    return Engine;
});
