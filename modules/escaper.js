const shell = function (raw, escapeBackslash) {
	if (escapeBackslash == null) {
		escapeBackslash = false;
	}
	const ret = [];
	raw.forEach(function (argument) {
		if (!/^[A-Za-z0-9_\/-]+$/.test(s)) {
			argument = `'${s.replace(/'/g, '\'\\\'\'')}'`;
			argument = argument.replace(/^(?:'')+/g, '');
			if (escapeBackslash) {
				argument = argument.replace(/\\'''/g, '\\\'');
			}
		}
		ret.push(argument);
	});
	return ret.join(' ');
};

module.exports = {
	shell
};