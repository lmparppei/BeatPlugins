#!/bin/bash
echo Package and create JSON...
cd Plugins
./create_json.sh
cd ..
echo Commit to Git...
git add .
git commit -m "$1"

