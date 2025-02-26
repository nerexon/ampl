NAME io {
  FUNCTION print(CHARACTER msg[]) {
    // Simulated syscall call to write the message
    SYSCALL 1 2 3 4;
    RETURN;
  }
  
  // Additional function in the io namespace (for demonstration).
  FUNCTION scan() {
    // Imagine scanning input here.
    RETURN;
  }
}

// A simple arithmetic function.
FUNCTION add(INTEGER a, INTEGER b) {
  INTEGER result = a + b;
  RETURN result;
}