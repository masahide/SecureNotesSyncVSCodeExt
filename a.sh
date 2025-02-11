#!/bin/bash

output_file="combined_prompt.txt"

> "$output_file"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 file1 file2 file3 ..."
  exit 1
fi

for file in "$@"; do
  if [ -f "$file" ]; then
    echo "### Start of $file ###" >> "$output_file"
    cat "$file" >> "$output_file"
    echo -e "\n### End of $file ###\n" >> "$output_file"
  else
    echo "Warning: $file does not exist and will be skipped."
  fi
done

echo "All files have been combined into $output_file."