
let Boards = {};

let raw = require("./boards.json");
for (let board of raw) {
    Boards[board.id] = board;
}

Boards.legacyFormat = () => {
    let result = { boards: [] };
    for (let key in Boards) {
        let board = Boards[key];
        if (typeof board != "object") {
            continue;
        }
        result.boards.push({
            id: board.id,
            model: board.name,
            opt: board.fpga,
            pnrOpt: board.package,
            pins: []
        });
    }
    return result;
}

module.exports = Boards;