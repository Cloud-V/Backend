{
    pkgs ? import <nixpkgs> {}
}:
with pkgs; mkShell {
    buildInputs = [
        nodejs-14_x
        nodejs-14_x.pkgs.yarn
        pkg-config
        clang
        verilog
        yosys
        nextpnr
        mongodb-6_0
    ];

    shellHook = ''
    export IVL_PATH=${verilog}/lib/ivl
    '';
}