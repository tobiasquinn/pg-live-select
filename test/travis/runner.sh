echo -e "\033[1;35m Run test on Postgres\033[0m"
psql -c 'create database travis_ci_test;' -U postgres
npm run test-pg || exit $?

echo -e "\033[1;35m Run test on MySQL 5.1.73\033[0m"
mysql -hlocalhost -p3351 -uroot -e "create database travis_test;"
TEST_MYSQL_PORT=3351 npm run test-mysql || exit $?
echo -e "\033[1;35m Run test on MySQL 5.5.41\033[0m"
mysql -hlocalhost -p3355 -uroot -e "create database travis_test;"
TEST_MYSQL_PORT=3355 npm run test-mysql || exit $?
echo -e "\033[1;35m Run test on MySQL 5.6.22\033[0m"
mysql -hlocalhost -p3356 -uroot -e "create database travis_test;"
TEST_MYSQL_PORT=3356 npm run test-mysql || exit $?

