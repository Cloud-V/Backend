const parser = require("./modules/parser");

console.log(parser.extractMetadata(`
// file: potato.v
// author: @potato

\`timescale 1ns/1ns

module potato(
   input[4:0] a,
   output b
);
  assign b = !a;
endmodule

`));