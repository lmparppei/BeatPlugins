#!/bin/bash

# This bash script creates a JSON file for Beat plugin library.
# © 2021 Lauri-Matti Parppei

IFS=$'\n'

json_escape () {
    printf '%s' "$1" | python3 -c 'import json,sys; 
print(json.dumps(sys.stdin.read(), ensure_ascii=False))'
}

json="{"

i=0
files=(*/)
count=${#files[@]}
echo "Distributing $count plugins..."

for dir in */
	do 
	filename=${dir//\//}
	pluginName=${dir//\//}

	echo "   $filename"

	if ! test -f "./$dir$filename"; then
	  	filename="plugin.js"
	fi
	if ! test -f "./$dir$filename"; then
	  	echo "   !!! No plugin file found"
	fi

	version=$(find "./$dir$filename" -type f -exec grep "Version:" {} \;);
	version=${version/Version: /}
	description=$(find "./$dir$filename" -type f -exec grep "Description:" {} \;);
	description=${description/Description: /}
	copyright=$(find "./$dir$filename" -type f -exec grep "Copyright:" {} \;);
	copyright=${copyright/Copyright: /}

	html=$(sed -n "/<Description>/,/<\/Description>/p" ./$dir$filename)
	html=${html//$'\n'/''}
	html=${html//$'\t'/''}
	html=$(json_escape "$html")

	image=$(find "./$dir$filename" -type f -exec grep "Image:" {} \;);
	image=${image/Image: /}

	if [[ $image ]]; then
		cp "./$dir/$image" "../Dist/Images/$pluginName $image"
		image="$pluginName $image"
	else
		image=""
	fi
	
	json+="		\"$pluginName\": { \"version\": \"$version\", \"copyright\": \"$copyright\", \"description\": \"$description\", \"image\": \"$image\", \"html\": $html }"

	i=$(($i + 1))
	if [[ $i -lt $count ]]
		then
			json+=$',\n'
	fi

	rm "../Dist/$pluginName.zip"
	zip -vrq "../Dist/$pluginName.zip" "./$dir" -x ".*" -x "__MACOSX"
done
json+="}"

echo "$json" > "../Dist/Beat Plugins.json"
echo "Written JSON file"
git add ../
