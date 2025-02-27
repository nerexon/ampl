bun run start
bun run compile

nasm -felf64 output.asm
ld output.o -o output