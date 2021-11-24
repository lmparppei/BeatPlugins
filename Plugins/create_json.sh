#!/bin/bash
IFS=$'\n'
#files=( $(find . -maxdepth 1 -mindepth 1  -type d) )

json="{"

i=0
files=(*/)
count=${#files[@]}
echo "Distributing $count plugins..."

for dir in */
	do 
	filename=${dir//\//}

	echo "   $filename"

	version=$(find "./$dir$filename" -type f -exec grep "Version:" {} \;);
	version=${version/Version: /}
	description=$(find "./$dir$filename" -type f -exec grep "Description:" {} \;);
	description=${description/Description: /}
	copyright=$(find "./$dir$filename" -type f -exec grep "Copyright:" {} \;);
	copyright=${copyright/Copyright: /}

	image=$(find "./$dir$filename" -type f -exec grep "Image:" {} \;);
	image=${image/Image: /}

	if [[ $image ]]; then
		echo "     image found"
		cp "./$filename/$image" "../Dist/Images/$image"
	fi
	
	json+="		\"$filename\": { \"version\": \"$version\", \"copyright\": \"$copyright\", \"description\": \"$description\", \"image\": \"$image\" }"

	i=$(($i + 1))
	if [[ $i -lt $count ]]
		then
			json+=$',\n'
	fi

	zip -vrq "../Dist/$filename.zip" "./$dir"
done
json+="}"

echo "$json" > "../Dist/Beat Plugins.json"
echo "Written JSON file"
git add ../
