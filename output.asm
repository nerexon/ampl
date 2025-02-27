section .data
  
      a: dq 1
      b: dq 2
 
section .text
  global _start

_start:

  call main
  mov rax, 60
  xor rdi, rdi
  syscall


main:
  push rbp
  mov rbp, rsp
  ; Function Body

        ; Local VariableDeclaration: c (offset: -8)
        sub rsp, 8 ; Allocate space on the stack
      
        mov rax, [a]
        mov QWORD [rbp - 8], rax
        mov rax, 60
  mov rdi, 0 ; Exit code (literal)
  syscall

  ; end of body
  mov rsp, rbp
  pop rbp
  ret
