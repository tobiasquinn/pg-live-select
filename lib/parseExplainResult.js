"use strict";

var _core = require("babel-runtime/core-js")["default"];

var util = require("util");

module.exports = function (plan) {
	var flatPlan = flatten(plan);

	var joinNodes = flatPlan.filter(function (node) {
		return "Join Type" in node;
	});
	console.log(joinNodes);

	var _iteratorNormalCompletion = true;
	var _didIteratorError = false;
	var _iteratorError = undefined;

	try {
		for (var _iterator = _core.$for.getIterator(joinNodes), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
			var node = _step.value;

			switch (node["Join Type"]) {
				case "Inner":
					if (node["Node Type"] === "Hash Join") {}
					break;
			}
		}
	} catch (err) {
		_didIteratorError = true;
		_iteratorError = err;
	} finally {
		try {
			if (!_iteratorNormalCompletion && _iterator["return"]) {
				_iterator["return"]();
			}
		} finally {
			if (_didIteratorError) {
				throw _iteratorError;
			}
		}
	}

	return plan;
};

function flatten(plan) {
	var out = [plan];
	if ("Plans" in plan) {
		var _iteratorNormalCompletion = true;
		var _didIteratorError = false;
		var _iteratorError = undefined;

		try {
			for (var _iterator = _core.$for.getIterator(plan.Plans), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
				var child = _step.value;

				out = out.concat(flatten(child));
			}
		} catch (err) {
			_didIteratorError = true;
			_iteratorError = err;
		} finally {
			try {
				if (!_iteratorNormalCompletion && _iterator["return"]) {
					_iterator["return"]();
				}
			} finally {
				if (_didIteratorError) {
					throw _iteratorError;
				}
			}
		}
	}
	return out;
}