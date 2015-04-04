var util = require('util')

module.exports = function(plan) {
	var flatPlan = flatten(plan)

	let joinNodes = flatPlan.filter(node => 'Join Type' in node)
	console.log(joinNodes)

	for(let node of joinNodes){
		switch(node['Join Type']){
			case 'Inner':
				if(node['Node Type'] === 'Hash Join'){
					
				}
				break
		}
	}
	return plan
}

function flatten(plan) {
	var out = [ plan ]
	if('Plans' in plan) {
		for(let child of plan['Plans']) {
			out = out.concat(flatten(child))
		}
	}
	return out
}
