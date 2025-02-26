USING "test2.ampl";

FUNCTION main() {
  // Declare an array of CHARACTERs and initialize it.
  CHARACTER greeting[] = "Hello, World!";
  
  // Call the print function in the io namespace.
  io:print(greeting);
  
  // Variable declarations with initializer and pointer syntax.
  INTEGER x = 42;
  INTEGER*ptr = x;  // Pointer declaration
  
  // Call a regular function.
  INTEGER sum = add(10, 32);
  
  // Call the SYSCALL function getTime.
  INTEGER t = getTime();
  
  // (Optionally, you could print or use these values further.)
  RETURN;
}
