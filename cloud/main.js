// HELPER FUNCTIONS
// Get all users
function getUsers() {
    Parse.Cloud.useMasterKey();
    var userQuery = new Parse.Query(Parse.User);
    return userQuery.find({
        success: function (users) {
            return users;
        },
        error: function (error) {
            return error;
        }
    });
};

// Get all users except one
function getUsersExcept(userId) {
    Parse.Cloud.useMasterKey();
    var userQuery = new Parse.Query(Parse.User);
    userQuery.notEqualTo("objectId", userId);
    return userQuery.find({
        success: function (users) {
            return users;
        },
        error: function (error) {
            return error;
        }
    });
};

// Get a single user
function getUser(userId) {
    Parse.Cloud.useMasterKey();
    var userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("objectId", userId);

    return userQuery.first({
        success: function (userRetrieved) {
            return userRetrieved;
        },
        error: function (error) {
            return error;
        }
    });
};

// MATCHING ALGORITHM 1
// This algorithm matches based on song titles and artist names
// Each exact song title match = +1
// Each arist match otherwise = +0.5
// Total score is divided by the multiplication of the two fav songs lengths
Parse.Cloud.job("matchJob", async (request, response) => {
    // params: passed in the job call
    // headers: from the request that triggered the job
    // log: the ParseServer logger passed in the request
    // message: a function to update the status message of the job object
    console.log("MATCH START");
    Parse.Cloud.useMasterKey();

    const {
        params,
        headers,
        log,
        message
    } = request;
    message("Matching just started");

    // FIND MATCHES
    // Delete all of the previous matches in case we have deleted users, etc.
    var Match = Parse.Object.extend("Match");

    var matchquery = new Parse.Query(Match);
    matchquery.find().then((matches) => {
        console.log("MATCH SEARCH SUCCESS");
        for (let a = 0; a < matches.length; a++) {
            matches[a].destroy().then(destroyed => {
                console.log("Successfully destroyed object" + JSON.stringify(destroyed));
            });
        }

        // Query all users
        getUsers().then(
            function (users) {
                console.log("USER SEARCH OK");

                // Go through each pair of users
                for (let i = 0; i < users.length; i++) {
                    for (let j = i + 1; j < users.length; j++) {
                        var FavSongs = Parse.Object.extend("FavSongs");

                        // Get the first user's favorite songs
                        var query1 = new Parse.Query(FavSongs);
                        query1.equalTo("user", users[i]);
                        query1.include("song");
                        query1.find().then((results1) => {
                            console.log("FOUND FIRST USER'S SONGS");

                            // Get the second user's favorite songs
                            var query2 = new Parse.Query(FavSongs);
                            query2.equalTo("user", users[j]);
                            query2.include("song");
                            query2.find().then((results2) => {
                                console.log("FOUND SECOND USER'S SONGS");
                                // Now calculate the score
                                console.log("STARTING CALCULATIONS...")
                                let score = 0.0;

                                for (let x = 0; x < results1.length; x++) {
                                    let check = false;
                                    for (let y = 0; y < results2.length; y++) {
                                        if (results1[x].get("song").get("spotifyId") === results2[y].get("song").get("spotifyId")) {
                                            // Check if the exact song matches
                                            score += 1.0;
                                            check = true;
                                            break;
                                        }
                                    }
                                    // If there are no exact song matches, we go through artists next
                                    if (check == false) {
                                        for (let y = 0; y < results2.length; y++) {
                                            if (results1[x].get("song").get("artists").some(r => results2[y].get("song").get("artists").indexOf(r) >= 0)) {
                                                // Check if any of the artists matches
                                                score += 0.5;
                                                break;
                                            }
                                        }
                                    }
                                }
                                // Total count is the lower of the two fav song lengths
                                let totalCount = Math.min(results1.length, results2.length);
                                let percent = score * 1.0 / totalCount;
                                console.log("FINISHED CALCULATING SCORE " + score + " FOR PERCENT " + percent);

                                // Now we can make a new Match
                                var Match = Parse.Object.extend("Match");
                                var matchObject1 = new Match();
                                matchObject1.save({
                                        to: users[i],
                                        from: users[j],
                                        percent: percent
                                    })
                                    .then((match1database) => {
                                        console.log("CREATED MATCH TO");

                                        var matchObject2 = new Match();
                                        matchObject2.save({
                                                to: users[j],
                                                from: users[i],
                                                percent: percent
                                            })
                                            .then((match2database) => {
                                                console.log("CREATED MATCH FROM");
                                            }, (error) => {
                                                console.log("ERROR" + error.message);

                                            });
                                    }, (error) => {
                                        console.log("ERROR" + error.message);

                                    });
                                console.log("CREATED MATCH");
                            });
                        });
                    }
                }
            },
            function (error) {
                response.error(error);
            }
        );
    });
    return ("Successfully finished all matching.");
});

// Function that does the same thing for a specific user
Parse.Cloud.define("findMatchForUser", async (request) => {
    // FIND MATCHES

    // If we already have matches, we don't need to run this again
    var Match = Parse.Object.extend("Match");

    var matchquery = new Parse.Query(Match);
    matchquery.equalTo("objectId", request.params.currentuser);
    matchquery.find().then((matches) => {
        if (matches.length > 0) {
            return true;
        }

        // Query all users except the current one
        getUsersExcept(request.params.currentuser).then(
            function (users) {
                console.log("USER SEARCH OK");

                // Go through each of the users
                var FavSongs = Parse.Object.extend("FavSongs");

                // Get the first user's favorite songs
                getUser(request.params.currentuser).then(function (currentUserObj) {
                        var query1 = new Parse.Query(FavSongs);
                        query1.equalTo("user", currentUserObj);
                        query1.include("song");
                        query1.find().then((results1) => {
                            console.log("FOUND FIRST USER'S SONGS");

                            for (let j = 0; j < users.length; j++) {
                                // Get the second user's favorite songs
                                var query2 = new Parse.Query(FavSongs);
                                query2.equalTo("user", users[j]);
                                query2.include("song");
                                query2.find().then((results2) => {
                                    console.log("FOUND SECOND USER'S SONGS");
                                    // Now calculate the score
                                    console.log("STARTING CALCULATIONS...")
                                    let score = 0.0;

                                    for (let x = 0; x < results1.length; x++) {
                                        let check = false;
                                        for (let y = 0; y < results2.length; y++) {
                                            if (results1[x].get("song").get("spotifyId") === results2[y].get("song").get("spotifyId")) {
                                                // Check if the exact song matches
                                                score += 1.0;
                                                check = true;
                                                break;
                                            }
                                        }
                                        // If there are no exact song matches, we go through artists next
                                        if (check == false) {
                                            for (let y = 0; y < results2.length; y++) {
                                                if (results1[x].get("song").get("artists").some(r => results2[y].get("song").get("artists").indexOf(r) >= 0)) {
                                                    // Check if any of the artists matches
                                                    score += 0.5;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    // Total count is the lower of the two fav song lengths
                                    let totalCount = Math.min(results1.length, results2.length);
                                    let percent = score * 1.0 / totalCount;
                                    console.log("FINISHED CALCULATING SCORE " + score + " FOR PERCENT " + percent);

                                    // Now we can make a new Match
                                    var Match = Parse.Object.extend("Match");
                                    var matchObject1 = new Match();
                                    matchObject1.save({
                                            to: currentUserObj,
                                            from: users[j],
                                            percent: percent
                                        })
                                        .then((match1database) => {
                                            console.log("CREATED MATCH TO");

                                            var matchObject2 = new Match();
                                            matchObject2.save({
                                                    to: users[j],
                                                    from: currentUserObj,
                                                    percent: percent
                                                })
                                                .then((match2database) => {
                                                    console.log("CREATED MATCH FROM");
                                                }, (error) => {
                                                    console.log("ERROR" + error.message);

                                                });
                                        }, (error) => {
                                            console.log("ERROR" + error.message);

                                        });
                                    console.log("CREATED MATCH");
                                });
                            }
                        });

                    },
                    function (error) {
                        response.error(error);
                    });
            },
            function (error) {
                response.error(error);
            }
        );
    });
    return true;
});




// MATCHING ALGORITHM 2
// This algorithm matches based on the audio features of each song
// If the audio feature matches exactly with the other audio feature, we add +1
// Else if the audio feature is within +/- 0.1 of the other audio feature, we add +0.7
// Else if the audio feature is within +/- 0.3 of the audio feature, we add +0.4
Parse.Cloud.job("match2Job", async (request, response) => {
    // params: passed in the job call
    // headers: from the request that triggered the job
    // log: the ParseServer logger passed in the request
    // message: a function to update the status message of the job object
    console.log("MATCH2 START");
    Parse.Cloud.useMasterKey();

    const {
        params,
        headers,
        log,
        message
    } = request;
    message("Matching2 just started");

    // FIND MATCHES
    // Delete all of the previous matches in case we have deleted users, etc.
    var Match2 = Parse.Object.extend("Match2");

    var matchquery = new Parse.Query(Match2);
    matchquery.find().then((matches) => {
        console.log("MATCH2 SEARCH SUCCESS");
        for (let a = 0; a < matches.length; a++) {
            matches[a].destroy().then(destroyed => {
                console.log("Successfully destroyed object" + JSON.stringify(destroyed));
            });
        }

        // Query all users
        getUsers().then(
            function (users) {
                console.log("USER SEARCH OK");

                // Go through each pair of users
                for (let i = 0; i < users.length; i++) {
                    for (let j = i + 1; j < users.length; j++) {
                        var FavSongs = Parse.Object.extend("FavSongs");

                        // Get the first user's favorite songs
                        var query1 = new Parse.Query(FavSongs);
                        query1.equalTo("user", users[i]);
                        query1.include("song");
                        query1.find().then((results1) => {
                            console.log("FOUND FIRST USER'S SONGS");

                            // Get the second user's favorite songs
                            var query2 = new Parse.Query(FavSongs);
                            query2.equalTo("user", users[j]);
                            query2.include("song");
                            query2.find().then((results2) => {
                                console.log("FOUND SECOND USER'S SONGS");
                                // Now calculate the score
                                console.log("STARTING CALCULATIONS...")
                                let score = 0.0;

                                for (let x = 0; x < results1.length; x++) {
                                    let check = false;
                                    for (let y = 0; y < results2.length; y++) {
                                        if (results1[x].get("song").get("spotifyId") === results2[y].get("song").get("spotifyId")) {
                                            // Check if the exact song matches
                                            score += 9.0;
                                            check = true;
                                            break;
                                        }
                                    }
                                    // If there are no exact song matches, we go through audio features next
                                    if (check == false) {
                                        let highest = 0.0;
                                        for (let y = 0; y < results2.length; y++) {
                                            let temp = 0.0;
                                            // Compare each audio feature
                                            for (let z = 0; z < 9; z++) {
                                                let feature1 = results1[x].get("song").get("audioFeatures")[z];
                                                let feature2 = results2[x].get("song").get("audioFeatures")[z];
                                                let check = Math.abs(feature1 - feature2);

                                                // If they're exact, add 1; otherwise, adjust accordingly
                                                if (check == 0.0) {
                                                    temp += 1.0;
                                                } else if (check <= 0.1) {
                                                    temp += 0.7;
                                                } else if (check <= 0.3) {
                                                    temp += 0.4;
                                                }
                                            }
                                            // We only want the highest matching audio feature (ie. don't want to compare every single song)
                                            if (temp > highest) {
                                                highest = temp;
                                            }
                                        }
                                        score += highest;
                                    }
                                }
                                // Total count is the lower of the two fav song lengths times the total possible score for exact matches
                                let totalCount = Math.min(results1.length, results2.length) * 9.0;
                                let percent = score * 1.0 / totalCount;
                                console.log("FINISHED CALCULATING SCORE " + score + " FOR PERCENT " + percent);

                                // Now we can make a new Match2
                                var Match2 = Parse.Object.extend("Match2");
                                var matchObject1 = new Match2();
                                matchObject1.save({
                                        to: users[i],
                                        from: users[j],
                                        percent: percent
                                    })
                                    .then((match1database) => {
                                        console.log("CREATED MATCH2 TO");

                                        var matchObject2 = new Match2();
                                        matchObject2.save({
                                                to: users[j],
                                                from: users[i],
                                                percent: percent
                                            })
                                            .then((match2database) => {
                                                console.log("CREATED MATCH2 FROM");
                                            }, (error) => {
                                                console.log("ERROR" + error.message);

                                            });
                                    }, (error) => {
                                        console.log("ERROR" + error.message);

                                    });
                                console.log("CREATED MATCH2");
                            });
                        });
                    }
                }
            },
            function (error) {
                response.error(error);
            }
        );
    });
    return ("Successfully finished all matching2.");
});

// Function that does the same thing for a specific user
Parse.Cloud.define("findMatch2ForUser", async (request) => {
    // FIND MATCHES

    // If we already have matches, we don't need to run this function again
    var Match2 = Parse.Object.extend("Match2");

    var matchquery = new Parse.Query(Match2);
    matchquery.equalTo("objectId", request.params.currentuser);
    matchquery.find().then((matches) => {
        if (matches.length > 0) {
            return true;
        }

        // Query all users except the current one
        getUsersExcept(request.params.currentuser).then(
            function (users) {
                console.log("USER SEARCH OK");

                // Go through each of the users
                var FavSongs = Parse.Object.extend("FavSongs");

                // Get the first user's favorite songs
                getUser(request.params.currentuser).then(function (currentUserObj) {
                        var query1 = new Parse.Query(FavSongs);
                        query1.equalTo("user", currentUserObj);
                        query1.include("song");
                        query1.find().then((results1) => {
                            console.log("FOUND FIRST USER'S SONGS");

                            for (let j = 0; j < users.length; j++) {
                                // Get the second user's favorite songs
                                var query2 = new Parse.Query(FavSongs);
                                query2.equalTo("user", users[j]);
                                query2.include("song");
                                query2.find().then((results2) => {
                                    console.log("FOUND SECOND USER'S SONGS");
                                    // Now calculate the score
                                    console.log("STARTING CALCULATIONS...")
                                    let score = 0.0;

                                    for (let x = 0; x < results1.length; x++) {
                                        let check = false;
                                        for (let y = 0; y < results2.length; y++) {
                                            if (results1[x].get("song").get("spotifyId") === results2[y].get("song").get("spotifyId")) {
                                                // Check if the exact song matches
                                                score += 9.0;
                                                check = true;
                                                break;
                                            }
                                        }
                                        // If there are no exact song matches, we go through audio features next
                                        if (check == false) {
                                            let highest = 0.0;
                                            for (let y = 0; y < results2.length; y++) {
                                                let temp = 0.0;
                                                // Compare each audio feature
                                                for (let z = 0; z < 9; z++) {
                                                    let feature1 = results1[x].get("song").get("audioFeatures")[z];
                                                    let feature2 = results2[x].get("song").get("audioFeatures")[z];
                                                    let check = Math.abs(feature1 - feature2);

                                                    // If they're exact, add 1; otherwise, adjust accordingly
                                                    if (check == 0.0) {
                                                        temp += 1.0;
                                                    } else if (check <= 0.1) {
                                                        temp += 0.7;
                                                    } else if (check <= 0.3) {
                                                        temp += 0.4;
                                                    }
                                                }
                                                // We only want the highest matching audio feature (ie. don't want to compare every single song)
                                                if (temp > highest) {
                                                    highest = temp;
                                                }
                                            }
                                            score += highest;
                                        }
                                    }
                                    // Total count is the lower of the two fav song lengths times the total possible score for exact matches
                                    let totalCount = Math.min(results1.length, results2.length) * 9.0;
                                    let percent = score * 1.0 / totalCount;
                                    console.log("FINISHED CALCULATING SCORE " + score + " FOR PERCENT " + percent);

                                    // Now we can make a new Match2
                                    var Match2 = Parse.Object.extend("Match2");
                                    var matchObject1 = new Match2();
                                    matchObject1.save({
                                            to: currentUserObj,
                                            from: users[j],
                                            percent: percent
                                        })
                                        .then((match1database) => {
                                            console.log("CREATED MATCH2 TO");

                                            var matchObject2 = new Match2();
                                            matchObject2.save({
                                                    to: users[j],
                                                    from: currentUserObj,
                                                    percent: percent
                                                })
                                                .then((match2database) => {
                                                    console.log("CREATED MATCH2 FROM");
                                                }, (error) => {
                                                    console.log("ERROR" + error.message);

                                                });
                                        }, (error) => {
                                            console.log("ERROR" + error.message);

                                        });
                                    console.log("CREATED MATCH2");
                                });
                            }
                        });

                    },
                    function (error) {
                        response.error(error);
                    });
            },
            function (error) {
                response.error(error);
            }
        );
    });
    return true;
});
