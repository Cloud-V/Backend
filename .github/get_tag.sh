TAG=$(git tag --points-at HEAD | tr -d '\n')
if [ $TAG ]; then
    echo "TAG=$TAG" >> $GITHUB_ENV
else
    echo "TAG=NA" >> $GITHUB_ENV
fi