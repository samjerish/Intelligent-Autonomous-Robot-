with open('src/components/SimulationView.tsx', 'r') as f:
    lines = f.readlines()

def check_brackets(lines):
    stack = []
    for i, line in enumerate(lines):
        for j, char in enumerate(line):
            if char in '({[':
                stack.append((char, i+1))
            elif char in ')}]':
                if not stack:
                    print(f"Extra closing {char} at line {i+1}")
                else:
                    top, start_line = stack.pop()
                    if (top == '(' and char != ')') or \
                       (top == '{' and char != '}') or \
                       (top == '[' and char != ']'):
                        print(f"Mismatch at line {i+1}: expected {top} match, got {char}")
    if stack:
        print(f"Unclosed brackets: {stack}")

check_brackets(lines)
