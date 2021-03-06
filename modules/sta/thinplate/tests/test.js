var TPS = require("../thinplate");

var target = [10, 20, 30, 40];

var tps1D = new TPS();

var pnts1D = [
	[10],
	[20],
	[30],
	[40]
];

tps1D.compile(pnts1D, target, function (err) {
	if (err) {
		console.error(err);
		return;
	}
	tps1D.getValues(pnts1D, function (err, result) {
		if (err) {
			console.error(err);
			return;
		}

		console.dir(result);
	});
});

var tps2D = new TPS();

var pnts2D = [
	[10, 10],
	[20, 10],
	[30, 20],
	[40, 100]
];

tps2D.compile(pnts2D, target, function (err) {

	if (err) {
		console.error(err);
		return;
	}

	tps2D.getValues(pnts2D, function (err, result) {
		if (err) {
			console.error(err);
			return;
		}

		console.dir(result);
	});

});

var pnts3D = [
	[0, 0, 1],
	[0, 1, 0],
	[1, 0, 0],
	[1, 0, 1]
];

var tps3D = new TPS();

tps3D.compile(pnts3D, target, function (err) {
	if (err) {
		console.error(err);
		return;
	}
	tps3D.getValues(pnts3D, function (err, result) {
		if (err) {
			console.error(err);
			return;
		}

		console.dir(result);
	})
});

// compile the thin-plate spline with fitpoints
// and with target points

var tps = new TPS();

var fitpoints = [
	[0, 1],
	[1, 1],
	[2, 5],
	[3, 4]
];

// we'll set the target to the be y value of each point
// this will generate a curve that goes through our fitpoints
var targets = fitpoints.map(function (curr) {
	return curr[curr.length - 1];
});

//compile requires fitpoint, target and a callback
// callback returns error if there is one
tps.compile(fitpoints, targets, function (err) {
	if (err) {
		console.error(err);
		return;
	}

	//now that it compiled we can use it.

	//fill out some random points to interpolate
	// (interpolation happens within the fitpoint boundaries)
	var pnts = [];
	for (var i = 0; i < 20; i++) {
		pnts.push([Math.random() * 5, Math.random() * 5]);
	}


	//have the tps solve for the values!
	tps.getValues(pnts, function (err, result) {

		if (err) {
			console.error(err);
			return;
		}
		console.dir(result.ys);
	});

	//fill out some random points to extrapolate
	// (extrapolation happens outside the fitpoint boundaries)
	var pnts = [];
	for (var i = 0; i < 20; i++) {
		pnts.push([5 + Math.random() * 5, 5 + Math.random() * 5]);
	}


	//have the tps solve for the values!
	tps.getValues(pnts, function (err, result) {

		if (err) {
			console.error(err);
			return;
		}
		console.dir(result.ys);
	});
});