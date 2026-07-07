#!/usr/bin/env bash
# Generates the two test files used in the reproduction.
# big-file.pdf stays under the default PHP 2M post_max_size.
mkdir -p testfiles
head -c 1500000 /dev/urandom > testfiles/big-file.pdf
head -c 300000 /dev/urandom > testfiles/small-file.pdf
echo "created testfiles/big-file.pdf (1.5MB) and testfiles/small-file.pdf (300KB)"
